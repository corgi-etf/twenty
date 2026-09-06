resource "aws_ecr_repository" "twenty" {
  name                 = "crm-production-twenty"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = false

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

resource "aws_ecr_lifecycle_policy" "twenty" {
  repository = aws_ecr_repository.twenty.name
  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Retain the newest 30 release images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 30
        }
        action = {
          type = "expire"
        }
      },
    ]
  })
}

resource "aws_ecs_cluster" "crm" {
  name = "crm-production"

  setting {
    name  = "containerInsights"
    value = "enhanced"
  }
}

resource "aws_cloudwatch_log_group" "server" {
  name              = "/ecs/crm-production/server"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/crm-production/worker"
  retention_in_days = 30
}

resource "aws_ecs_task_definition" "server" {
  family                   = "crm-production-server"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  runtime_platform {
    cpu_architecture        = "X86_64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([
    {
      name        = "server"
      image       = "twentycrm/twenty:v2.38.1"
      essential   = true
      stopTimeout = 120
      linuxParameters = {
        initProcessEnabled = true
      }
      portMappings = [
        {
          name          = "server-http"
          containerPort = 3000
          hostPort      = 3000
          protocol      = "tcp"
          appProtocol   = "http"
        },
      ]
      environment = concat(local.common_environment, [
        { name = "DISABLE_DB_MIGRATIONS", value = "false" },
        { name = "DISABLE_CRON_JOBS_REGISTRATION", value = "false" },
      ])
      secrets = local.common_secrets
      healthCheck = {
        command     = ["CMD-SHELL", "curl --fail http://localhost:3000/healthz || exit 1"]
        interval    = 30
        timeout     = 10
        retries     = 3
        startPeriod = 180
      }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.server.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "server"
        }
      }
    },
  ])
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "crm-production-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 1024
  memory                   = 2048
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  runtime_platform {
    cpu_architecture        = "X86_64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([
    {
      name        = "worker"
      image       = "twentycrm/twenty:v2.38.1"
      essential   = true
      command     = ["yarn", "worker:prod"]
      stopTimeout = 120
      linuxParameters = {
        initProcessEnabled = true
      }
      environment = concat(local.common_environment, [
        { name = "DISABLE_DB_MIGRATIONS", value = "true" },
        { name = "DISABLE_CRON_JOBS_REGISTRATION", value = "true" },
      ])
      secrets = local.common_secrets
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.worker.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "worker"
        }
      }
    },
  ])
}

resource "aws_ecs_service" "server" {
  name             = "crm-production-server"
  cluster          = aws_ecs_cluster.crm.id
  task_definition  = aws_ecs_task_definition.server.arn
  desired_count    = var.server_desired_count
  launch_type      = "FARGATE"
  platform_version = "LATEST"

  health_check_grace_period_seconds = 300
  enable_ecs_managed_tags           = true
  propagate_tags                    = "SERVICE"
  wait_for_steady_state             = false

  # A desired count of one plus a maximum of 100 guarantees migrations never run concurrently.
  deployment_minimum_healthy_percent = 0
  deployment_maximum_percent         = 100

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    assign_public_ip = local.task_public_ip_mode
    security_groups  = [aws_security_group.tasks.id]
    subnets          = local.task_subnet_ids
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.server.arn
    container_name   = "server"
    container_port   = 3000
  }

  lifecycle {
    ignore_changes = [task_definition]
  }

  depends_on = [aws_lb_listener.https]
}

resource "aws_ecs_service" "worker" {
  name             = "crm-production-worker"
  cluster          = aws_ecs_cluster.crm.id
  task_definition  = aws_ecs_task_definition.worker.arn
  desired_count    = var.worker_desired_count
  launch_type      = "FARGATE"
  platform_version = "LATEST"

  enable_ecs_managed_tags = true
  propagate_tags          = "SERVICE"
  wait_for_steady_state   = false

  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    assign_public_ip = local.task_public_ip_mode
    security_groups  = [aws_security_group.tasks.id]
    subnets          = local.task_subnet_ids
  }

  lifecycle {
    ignore_changes = [task_definition]
  }
}
