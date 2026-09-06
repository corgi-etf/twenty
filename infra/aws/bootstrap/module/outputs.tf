output "state_bucket_name" {
  description = "S3 bucket used by the CRM Terraform backends."
  value       = aws_s3_bucket.terraform_state.id
}

output "state_bucket_arn" {
  description = "ARN of the S3 bucket used by the CRM Terraform backends."
  value       = aws_s3_bucket.terraform_state.arn
}

