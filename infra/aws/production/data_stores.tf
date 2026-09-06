resource "aws_s3_bucket" "uploads" {
  bucket = "corgi-crm-production-uploads-${var.aws_account_id}-${var.aws_region}"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }

    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_policy" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  policy = data.aws_iam_policy_document.uploads_bucket.json
}

data "aws_iam_policy_document" "uploads_bucket" {
  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.uploads.arn,
      "${aws_s3_bucket.uploads.arn}/*",
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD", "PUT", "POST"]
    allowed_origins = ["https://${var.domain_name}"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

resource "aws_db_subnet_group" "crm" {
  name       = "${local.name_prefix}-database"
  subnet_ids = local.private_subnet_ids

  tags = {
    Name = "${local.name_prefix}-database"
  }
}

resource "aws_db_instance" "crm" {
  identifier = "${local.name_prefix}-postgres"

  engine         = "postgres"
  engine_version = "16"
  instance_class = "db.t4g.medium"

  db_name  = "twenty"
  username = "twenty"
  port     = 5432

  manage_master_user_password = true

  allocated_storage     = 20
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true

  multi_az               = true
  publicly_accessible    = false
  db_subnet_group_name   = aws_db_subnet_group.crm.name
  vpc_security_group_ids = [aws_security_group.database.id]

  backup_retention_period = 7
  backup_window           = "07:00-08:00"
  maintenance_window      = "sun:08:00-sun:09:00"
  copy_tags_to_snapshot   = true

  auto_minor_version_upgrade = true
  deletion_protection        = true
  skip_final_snapshot        = false
  final_snapshot_identifier  = "${local.name_prefix}-postgres-final"

  performance_insights_enabled          = true
  performance_insights_retention_period = 7

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_elasticache_subnet_group" "crm" {
  name       = "${local.name_prefix}-cache"
  subnet_ids = local.private_subnet_ids
}

resource "aws_elasticache_parameter_group" "crm" {
  name   = "${local.name_prefix}-valkey8"
  family = "valkey8"

  parameter {
    name  = "maxmemory-policy"
    value = "noeviction"
  }
}

resource "aws_elasticache_replication_group" "crm" {
  replication_group_id = "${local.name_prefix}-cache"
  description          = "Dedicated TLS-encrypted Twenty CRM queue and cache"

  engine         = "valkey"
  engine_version = "8.0"
  node_type      = "cache.t4g.small"
  port           = 6379

  num_cache_clusters         = 2
  automatic_failover_enabled = true
  multi_az_enabled           = true

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  transit_encryption_mode    = "required"

  parameter_group_name = aws_elasticache_parameter_group.crm.name
  subnet_group_name    = aws_elasticache_subnet_group.crm.name
  security_group_ids   = [aws_security_group.cache.id]

  snapshot_retention_limit   = 7
  snapshot_window            = "06:00-07:00"
  maintenance_window         = "sun:09:00-sun:10:00"
  auto_minor_version_upgrade = true
  apply_immediately          = false

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_secretsmanager_secret" "database_url" {
  name                    = "crm/production/PG_DATABASE_URL"
  description             = "Twenty PostgreSQL URL; populated out of band after RDS creation"
  recovery_window_in_days = 30

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_secretsmanager_secret" "encryption_key" {
  name                    = "crm/production/ENCRYPTION_KEY"
  description             = "Twenty application and encryption key; populated out of band"
  recovery_window_in_days = 30

  lifecycle {
    prevent_destroy = true
  }
}
