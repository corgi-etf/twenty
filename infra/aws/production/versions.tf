terraform {
  backend "s3" {
    bucket       = "corgi-crm-terraform-state-182018075072-us-east-2"
    key          = "production/terraform.tfstate"
    region       = "us-east-2"
    encrypt      = true
    use_lockfile = true
  }

  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region              = var.aws_region
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = {
      Project     = "crm"
      Environment = "production"
      ManagedBy   = "terraform"
      Owner       = "Corgi-ETF"
      Repository  = var.github_repository
      CostCenter  = "crm"
    }
  }
}

