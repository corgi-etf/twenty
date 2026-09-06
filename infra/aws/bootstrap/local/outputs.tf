output "state_bucket_name" {
  description = "S3 bucket used by the CRM Terraform backends."
  value       = module.state.state_bucket_name
}

output "state_bucket_arn" {
  description = "ARN of the S3 bucket used by the CRM Terraform backends."
  value       = module.state.state_bucket_arn
}
