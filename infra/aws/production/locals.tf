locals {
  name_prefix = "crm-production"

  availability_zones = slice(data.aws_availability_zones.available.names, 0, 2)

  public_subnet_cidrs = {
    for index, availability_zone in local.availability_zones :
    availability_zone => cidrsubnet("10.20.0.0/16", 8, index)
  }

  private_subnet_cidrs = {
    for index, availability_zone in local.availability_zones :
    availability_zone => cidrsubnet("10.20.0.0/16", 8, index + 10)
  }

  public_subnet_ids  = [for subnet in aws_subnet.public : subnet.id]
  private_subnet_ids = [for subnet in aws_subnet.private : subnet.id]

  task_subnet_ids     = var.use_nat_gateways ? local.private_subnet_ids : local.public_subnet_ids
  task_public_ip_mode = !var.use_nat_gateways

  common_environment = [
    { name = "NODE_ENV", value = "production" },
    { name = "NODE_PORT", value = "3000" },
    { name = "SERVER_URL", value = "https://${var.domain_name}" },
    { name = "DPA_DEPLOYMENT_REGION", value = "US" },
    { name = "EMAIL_DRIVER", value = "AWS_SES" },
    { name = "EMAIL_FROM_ADDRESS", value = "noreply@corgiinvest.com" },
    { name = "EMAIL_FROM_NAME", value = "Corgi CRM" },
    { name = "AWS_SES_REGION", value = var.aws_region },
    { name = "PG_SSL_ALLOW_SELF_SIGNED", value = "true" },
    { name = "REDIS_URL", value = "rediss://${aws_elasticache_replication_group.crm.primary_endpoint_address}:6379" },
    { name = "STORAGE_TYPE", value = "S_3" },
    { name = "STORAGE_S3_REGION", value = var.aws_region },
    { name = "STORAGE_S3_NAME", value = aws_s3_bucket.uploads.id },
    { name = "IS_MULTIWORKSPACE_ENABLED", value = "false" },
    { name = "IS_CONFIG_VARIABLES_IN_DB_ENABLED", value = "true" },
    { name = "IS_EMAIL_VERIFICATION_REQUIRED", value = "true" },
    { name = "SIGN_IN_PREFILLED", value = "false" },
    { name = "IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS", value = "true" },
    { name = "LOGIC_FUNCTION_TYPE", value = "LOCAL" },
    { name = "CODE_INTERPRETER_TYPE", value = "DISABLED" },
  ]

  common_secrets = [
    { name = "PG_DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
    { name = "APP_SECRET", valueFrom = aws_secretsmanager_secret.encryption_key.arn },
    { name = "ENCRYPTION_KEY", valueFrom = aws_secretsmanager_secret.encryption_key.arn },
  ]
}

data "aws_availability_zones" "available" {
  state = "available"

  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

data "aws_caller_identity" "current" {}

data "aws_iam_openid_connect_provider" "github" {
  arn = var.github_oidc_provider_arn
}

data "aws_route53_zone" "public" {
  zone_id      = var.hosted_zone_id
  private_zone = false
}
