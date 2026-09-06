variable "aws_region" {
  description = "AWS region that stores the CRM Terraform state."
  type        = string
  default     = "us-east-2"
}

variable "state_bucket_name" {
  description = "Globally unique S3 bucket name for the dedicated CRM Terraform state."
  type        = string
  default     = "corgi-crm-terraform-state-182018075072-us-east-2"
}

