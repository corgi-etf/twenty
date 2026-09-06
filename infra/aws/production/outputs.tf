output "aws_account_id" {
  description = "AWS account verified by the production provider."
  value       = data.aws_caller_identity.current.account_id
}

output "cluster_name" {
  description = "ECS cluster name used by CI/CD."
  value       = aws_ecs_cluster.crm.name
}

output "ecr_repository_url" {
  description = "ECR repository URL used by CI/CD for Twenty images."
  value       = aws_ecr_repository.twenty.repository_url
}

output "server_service_name" {
  description = "ECS server service name used by CI/CD."
  value       = aws_ecs_service.server.name
}

output "worker_service_name" {
  description = "ECS worker service name used by CI/CD."
  value       = aws_ecs_service.worker.name
}

output "server_task_definition_family" {
  description = "Twenty server task definition family used by CI/CD."
  value       = aws_ecs_task_definition.server.family
}

output "worker_task_definition_family" {
  description = "Twenty worker task definition family used by CI/CD."
  value       = aws_ecs_task_definition.worker.family
}

output "github_deploy_role_arn" {
  description = "GitHub Actions OIDC role ARN for production deployments."
  value       = aws_iam_role.github_deploy.arn
}

output "database_url_secret_arn" {
  description = "Empty Secrets Manager container to populate with PG_DATABASE_URL after phase one."
  value       = aws_secretsmanager_secret.database_url.arn
}

output "encryption_key_secret_arn" {
  description = "Empty Secrets Manager container to populate with the Twenty encryption key after phase one."
  value       = aws_secretsmanager_secret.encryption_key.arn
}

output "database_address" {
  description = "Private RDS hostname used to construct PG_DATABASE_URL without exposing credentials."
  value       = aws_db_instance.crm.address
}

output "database_endpoint" {
  description = "Private RDS host and port."
  value       = aws_db_instance.crm.endpoint
}

output "database_master_secret_arn" {
  description = "AWS-managed RDS master credential secret used only to bootstrap PG_DATABASE_URL."
  value       = aws_db_instance.crm.master_user_secret[0].secret_arn
}

output "redis_primary_endpoint" {
  description = "Private primary endpoint for the TLS-enabled Valkey replication group."
  value       = aws_elasticache_replication_group.crm.primary_endpoint_address
}

output "load_balancer_dns_name" {
  description = "Public ALB DNS name."
  value       = aws_lb.crm.dns_name
}

output "crm_url" {
  description = "Public HTTPS URL for Twenty CRM."
  value       = "https://${var.domain_name}"
}

output "uploads_bucket_name" {
  description = "Private S3 bucket used by Twenty for uploaded files."
  value       = aws_s3_bucket.uploads.id
}

output "tasks_use_nat_gateways" {
  description = "Whether ECS tasks use private subnets and one NAT gateway per AZ."
  value       = var.use_nat_gateways
}
