resource "aws_security_group" "alb" {
  name        = "${var.environment}-scoopdope-alb-sg"
  description = "Security group for Application Load Balancer"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.environment}-scoopdope-alb-sg"
    Environment = var.environment
  }
}

locals {
  has_cert = var.certificate_arn != ""
  has_logs = var.log_bucket_id != ""
}

resource "aws_lb" "main" {
  name               = "${var.environment}-scoopdope-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids

  enable_deletion_protection = var.environment == "prod"

  dynamic "access_logs" {
    for_each = local.has_logs ? [1] : []
    content {
      bucket  = var.log_bucket_id
      enabled = true
    }
  }

  tags = {
    Name        = "${var.environment}-scoopdope-alb"
    Environment = var.environment
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = local.has_cert ? "redirect" : "forward"

    dynamic "redirect" {
      for_each = local.has_cert ? [1] : []
      content {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }

    dynamic "forward" {
      for_each = local.has_cert ? [] : [1]
      content {
        target_group_arn = var.frontend_target_group_arn
      }
    }
  }
}

resource "aws_lb_listener" "https" {
  count = local.has_cert ? 1 : 0

  load_balancer_arn = aws_lb.main.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = var.frontend_target_group_arn
  }
}

resource "aws_lb_listener_rule" "backend_api" {
  count = local.has_cert ? 1 : 0

  listener_arn = aws_lb_listener.https[0].arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = var.backend_target_group_arn
  }

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }
}
