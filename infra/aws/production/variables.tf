variable "aws_region" {
  description = "AWS region for the dedicated CRM production stack."
  type        = string
  default     = "us-east-2"
}

variable "aws_account_id" {
  description = "Only AWS account in which this stack is permitted to operate."
  type        = string
  default     = "182018075072"

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must be a 12-digit AWS account ID."
  }
}

variable "domain_name" {
  description = "Public DNS name for the CRM."
  type        = string
  default     = "crm.corgiinvest.com"
}

variable "hosted_zone_id" {
  description = "Existing public Route 53 zone ID for corgiinvest.com."
  type        = string
  default     = "Z09323993H0DWKCCNCZWY"
}

variable "github_repository" {
  description = "GitHub organization and repository allowed to deploy the CRM."
  type        = string
  default     = "Corgi-ETF/twenty"
}

variable "github_environment" {
  description = "GitHub environment required in the deploy role OIDC subject."
  type        = string
  default     = "production"
}

variable "github_oidc_provider_arn" {
  description = "ARN of the existing account-level GitHub Actions OIDC provider."
  type        = string
  default     = "arn:aws:iam::182018075072:oidc-provider/token.actions.githubusercontent.com"
}

variable "server_desired_count" {
  description = "Desired number of Twenty server tasks; use zero only during phase-one secret bootstrap."
  type        = number
  default     = 1

  validation {
    condition     = var.server_desired_count >= 0
    error_message = "server_desired_count cannot be negative."
  }
}

variable "worker_desired_count" {
  description = "Desired number of Twenty worker tasks; use zero only during phase-one secret bootstrap."
  type        = number
  default     = 1

  validation {
    condition     = var.worker_desired_count >= 0
    error_message = "worker_desired_count cannot be negative."
  }
}

variable "monthly_budget_usd" {
  description = "Informational monthly cost budget in USD; no email subscriber is configured."
  type        = number
  default     = 300
}

