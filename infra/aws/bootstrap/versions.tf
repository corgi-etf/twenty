terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "crm"
      Environment = "production"
      ManagedBy   = "terraform"
      Owner       = "Corgi-ETF"
      Repository  = "Corgi-ETF/twenty"
      CostCenter  = "crm"
    }
  }
}

