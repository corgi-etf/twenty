# Twenty CRM production on AWS

This Terraform root owns a standalone production deployment for `https://crm.corgiinvest.com` in account `182018075072`, region `us-east-2`. Existing ETF resources are read-only and are not part of this state.

## Safety invariants

- Always use `AWS_PROFILE=etf-deployment` and verify the account before every plan or apply.
- Apply only a saved, reviewed plan. Never use `-auto-approve`.
- The first deployment is deliberately two-phase because the task definitions reference empty Secrets Manager containers.
- Do not commit state, plans, tfvars, secret values, or generated files.
- ECS services ignore `task_definition` drift because CI owns application revisions after bootstrap.
- The server service uses a stop-before-start deployment (`minimum=0`, `maximum=100`, desired count `1`) so Twenty migrations cannot run concurrently. This creates a brief maintenance window during server releases.

## Prerequisite

Apply [`../bootstrap`](../bootstrap/README.md), migrate its state, and verify the state bucket exists before initializing this root.

The GitHub `production` environment must restrict deployment branches to `main`. GitHub's environment-based OIDC subject contains the repository and environment, not the branch; the environment protection rule is the enforcement point for the main-branch restriction.

## Phase 1: infrastructure with services stopped

```bash
AWS_PROFILE=etf-deployment aws sts get-caller-identity
AWS_PROFILE=etf-deployment terraform init
AWS_PROFILE=etf-deployment terraform plan \
  -var='server_desired_count=0' \
  -var='worker_desired_count=0' \
  -out=phase-one.tfplan
AWS_PROFILE=etf-deployment terraform show phase-one.tfplan
AWS_PROFILE=etf-deployment terraform apply phase-one.tfplan
rm phase-one.tfplan
```

Two NAT gateways are the production default. If the account's EIP quota increase is still pending, set `TF_VAR_use_nat_gateways=false` before both phase-one and phase-two plans. That fallback keeps RDS and Valkey in isolated private subnets but runs ECS tasks in the dedicated VPC's public subnets with public IPs. The task security group still accepts inbound traffic only from the ALB; public IPs increase internet exposure and should be replaced with the default private-subnet/NAT design after the quota is approved.

```bash
export TF_VAR_use_nat_gateways=false
```

The plan must create only resources tagged `Project=crm`, except the existing Route 53 zone and GitHub OIDC provider, which are read-only data sources.

## Populate secret versions without printing values

The commands below stream both values directly between processes. They do not put the RDS password or encryption key in Terraform state, shell history, command arguments, or terminal output. `jq` and `openssl` must be installed.

```bash
CRM_RDS_SECRET_ARN=$(AWS_PROFILE=etf-deployment terraform output -raw database_master_secret_arn)
CRM_DATABASE_SECRET_ARN=$(AWS_PROFILE=etf-deployment terraform output -raw database_url_secret_arn)
CRM_DATABASE_HOST=$(AWS_PROFILE=etf-deployment terraform output -raw database_address)

AWS_PROFILE=etf-deployment aws secretsmanager get-secret-value \
  --secret-id "$CRM_RDS_SECRET_ARN" \
  --query SecretString \
  --output text \
| jq -jr --arg host "$CRM_DATABASE_HOST" \
  '"postgres://\(.username | @uri):\(.password | @uri)@\($host):5432/twenty"' \
| AWS_PROFILE=etf-deployment aws secretsmanager put-secret-value \
  --secret-id "$CRM_DATABASE_SECRET_ARN" \
  --secret-string file:///dev/stdin \
  >/dev/null

CRM_ENCRYPTION_SECRET_ARN=$(AWS_PROFILE=etf-deployment terraform output -raw encryption_key_secret_arn)

openssl rand -base64 48 \
| tr -d '\n' \
| AWS_PROFILE=etf-deployment aws secretsmanager put-secret-value \
  --secret-id "$CRM_ENCRYPTION_SECRET_ARN" \
  --secret-string file:///dev/stdin \
  >/dev/null
```

## Phase 2: start one server and one worker

```bash
AWS_PROFILE=etf-deployment terraform plan -out=phase-two.tfplan
AWS_PROFILE=etf-deployment terraform show phase-two.tfplan
AWS_PROFILE=etf-deployment terraform apply phase-two.tfplan
rm phase-two.tfplan
```

When using the temporary no-NAT fallback, keep `TF_VAR_use_nat_gateways=false` set for phase two and later convergence checks. After the quota is approved, unset it, review a saved plan that adds only the two CRM NAT gateways/EIPs and moves the services to private subnets, then apply during a maintenance window.

Verify convergence and health:

```bash
AWS_PROFILE=etf-deployment terraform plan
AWS_PROFILE=etf-deployment aws ecs describe-services \
  --region us-east-2 \
  --cluster crm-production \
  --services crm-production-server crm-production-worker
curl --fail --show-error --silent https://crm.corgiinvest.com/healthz >/dev/null
```

## CI/CD contract

| Item | Value |
| --- | --- |
| Cluster | `crm-production` |
| ECR repository | `crm-production-twenty` |
| Server service / task family / container | `crm-production-server` / `crm-production-server` / `server` |
| Worker service / task family / container | `crm-production-worker` / `crm-production-worker` / `worker` |
| Server log group / prefix | `/ecs/crm-production/server` / `server` |
| Worker log group / prefix | `/ecs/crm-production/worker` / `worker` |
| OIDC role | `crm-production-github-deploy` |

The bootstrap task definitions use the upstream Linux x86_64 release pinned as `twentycrm/twenty:v2.38.1@sha256:1f4526b05f6591461335700f8c6d45e88cbc4dc037e1ef0bef9daca62da343ea`. CI builds with Nx, pushes immutable commit-addressed images to ECR, registers new task definition revisions, and updates only these two services.

## Cost and operational notes

The main fixed costs are two NAT gateways, a Multi-AZ `db.t4g.medium`, two `cache.t4g.small` nodes, the ALB, and two continuously running 1-vCPU/2-GiB Fargate tasks. Expect roughly USD 300–450 per month before data transfer, storage growth, logs, and unusually high traffic. The Terraform budget is informational and deliberately has no email subscriber.

Alarms and a `crm-production` dashboard are created, but alarms have no notification actions until an operator-owned destination is selected. RDS, Valkey, the uploads bucket, the ALB, and the state bucket are deletion-protected; teardown requires an explicit reviewed code change.
