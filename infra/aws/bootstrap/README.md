# CRM Terraform state bootstrap

This bootstrap creates only the dedicated, private, encrypted, versioned S3 state bucket. The `local` wrapper uses the same `module.state` resource addresses as the final root and writes its initial state to `bootstrap/terraform.tfstate`. This avoids the Terraform chicken-and-egg problem without any temporary source edits.

All AWS and Terraform commands must use the `etf-deployment` profile and must resolve to account `182018075072`.

## Create the bucket

```bash
AWS_PROFILE=etf-deployment aws sts get-caller-identity
cd local
AWS_PROFILE=etf-deployment terraform init
AWS_PROFILE=etf-deployment terraform plan -out=bootstrap.tfplan
AWS_PROFILE=etf-deployment terraform show bootstrap.tfplan
AWS_PROFILE=etf-deployment terraform apply bootstrap.tfplan
rm bootstrap.tfplan
cd ..
```

Review the saved plan before applying it. The plan must contain only the `corgi-crm-terraform-state-182018075072-us-east-2` bucket and its controls.

## Migrate bootstrap state into S3

The S3 backend is already encoded in the final root's `versions.tf`, keeping the repository as the source of truth. After the bucket exists, migrate `bootstrap/terraform.tfstate` into S3. Do not delete local state until the migration and a no-change plan are verified.

```bash
AWS_PROFILE=etf-deployment terraform init -migrate-state -force-copy
AWS_PROFILE=etf-deployment terraform plan
```

The production root already uses the same bucket with an isolated `production/terraform.tfstate` key and native S3 lockfiles.
