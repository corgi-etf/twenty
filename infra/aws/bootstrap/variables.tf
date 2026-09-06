variable "aws_region" {
  description = "AWS region that stores the CRM Terraform state."
  type        = string
  default     = "us-east-2"
}

variable "aws_account_id" {
  description = "Only AWS account in which the CRM state bucket is permitted to be created."
  type        = string
  default     = "182018075072"
}

variable "state_bucket_name" {
  description = "Globally unique S3 bucket name for the dedicated CRM Terraform state."
  type        = string
  default     = "corgi-crm-terraform-state-182018075072-us-east-2"
}
