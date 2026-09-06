resource "aws_cloudwatch_metric_alarm" "alb_unhealthy_hosts" {
  alarm_name          = "${local.name_prefix}-unhealthy-hosts"
  alarm_description   = "Twenty server has an unhealthy ALB target"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  threshold           = 1
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Maximum"
  treat_missing_data  = "breaching"

  dimensions = {
    LoadBalancer = aws_lb.crm.arn_suffix
    TargetGroup  = aws_lb_target_group.server.arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "alb_server_errors" {
  alarm_name          = "${local.name_prefix}-server-5xx"
  alarm_description   = "Twenty server returned elevated HTTP 5xx responses"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  threshold           = 5
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Sum"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.crm.arn_suffix
    TargetGroup  = aws_lb_target_group.server.arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "server_cpu" {
  alarm_name          = "${local.name_prefix}-server-cpu"
  alarm_description   = "Twenty server CPU is above 80 percent"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 3
  threshold           = 80
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  treat_missing_data  = "notBreaching"

  dimensions = {
    ClusterName = aws_ecs_cluster.crm.name
    ServiceName = aws_ecs_service.server.name
  }
}

resource "aws_cloudwatch_metric_alarm" "worker_cpu" {
  alarm_name          = "${local.name_prefix}-worker-cpu"
  alarm_description   = "Twenty worker CPU is above 80 percent"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 3
  threshold           = 80
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  treat_missing_data  = "notBreaching"

  dimensions = {
    ClusterName = aws_ecs_cluster.crm.name
    ServiceName = aws_ecs_service.worker.name
  }
}

resource "aws_cloudwatch_metric_alarm" "database_storage" {
  alarm_name          = "${local.name_prefix}-database-storage"
  alarm_description   = "PostgreSQL has less than 5 GiB of free storage"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  threshold           = 5368709120
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  treat_missing_data  = "breaching"

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.crm.identifier
  }
}

resource "aws_cloudwatch_metric_alarm" "cache_memory" {
  alarm_name          = "${local.name_prefix}-cache-memory"
  alarm_description   = "Valkey database memory is above 80 percent"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 3
  threshold           = 80
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = 60
  statistic           = "Average"
  treat_missing_data  = "breaching"

  dimensions = {
    CacheClusterId = sort(tolist(aws_elasticache_replication_group.crm.member_clusters))[0]
  }
}

resource "aws_cloudwatch_dashboard" "crm" {
  dashboard_name = local.name_prefix

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "ECS CPU and memory"
          view   = "timeSeries"
          region = var.aws_region
          period = 60
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ClusterName", aws_ecs_cluster.crm.name, "ServiceName", aws_ecs_service.server.name],
            [".", "MemoryUtilization", ".", ".", ".", "."],
            [".", "CPUUtilization", ".", ".", ".", aws_ecs_service.worker.name],
            [".", "MemoryUtilization", ".", ".", ".", "."],
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title  = "ALB requests and errors"
          view   = "timeSeries"
          region = var.aws_region
          period = 60
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.crm.arn_suffix],
            [".", "HTTPCode_Target_5XX_Count", ".", "."],
            [".", "TargetResponseTime", ".", ".", { stat = "p95" }],
          ]
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "PostgreSQL"
          view   = "timeSeries"
          region = var.aws_region
          period = 300
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", aws_db_instance.crm.identifier],
            [".", "DatabaseConnections", ".", "."],
            [".", "FreeStorageSpace", ".", "."],
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title  = "Valkey"
          view   = "timeSeries"
          region = var.aws_region
          period = 60
          metrics = [
            ["AWS/ElastiCache", "DatabaseMemoryUsagePercentage", "CacheClusterId", sort(tolist(aws_elasticache_replication_group.crm.member_clusters))[0]],
            [".", "EngineCPUUtilization", ".", "."],
            [".", "CurrConnections", ".", "."],
          ]
        }
      },
    ]
  })
}

resource "aws_budgets_budget" "monthly" {
  name         = "${local.name_prefix}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "TagKeyValue"
    values = ["user:Project$crm"]
  }
}
