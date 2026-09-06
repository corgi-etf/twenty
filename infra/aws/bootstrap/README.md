# CRM Terraform state bootstrap

This root creates only the dedicated, private, encrypted, versioned S3 state bucket. It intentionally starts with local state because the bucket cannot be its own backend before it exists.

All AWS and Terraform commands must use the `etf-deployment` profile and must resolve to account `182018075072`.

## Create the bucket

```bash
AWS_PROFILE=etf-deployment aws sts get-caller-identity
AWS_PROFILE=etf-deployment terraform init
AWS_PROFILE=etf-deployment terraform plan -out=tfplan
AWS_PROFILE=etf-deployment terraform show tfplan
AWS_PROFILE=etf-deployment terraform apply tfplan
rm tfplan
```

Review the saved plan before applying it. The plan must contain only the `corgi-crm-terraform-state-182018075072-us-east-2` bucket and its controls.

## Migrate bootstrap state into S3

After the bucket exists, add this backend block to `versions.tf` and migrate the local state. Do not delete local state until the migration and a no-change plan are verified.

```hcl
terraform {
  backend "s3" {
    bucket       = "corgi-crm-terraform-state-182018075072-us-east-2"
    key          = "bootstrap/terraform.tfstate"
    region       = "us-east-2"
    encrypt      = true
    use_lockfile = true
  }
}
```

```bash
AWS_PROFILE=etf-deployment terraform init -migrate-state
AWS_PROFILE=etf-deployment terraform plan
```

The production root already uses the same bucket with an isolated `production/terraform.tfstate` key and native S3 lockfiles.
