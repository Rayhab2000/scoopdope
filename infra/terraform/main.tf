terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "scoopdope-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "scoopdope-terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      ManagedBy   = "Terraform"
      Project     = "scoopdope"
    }
  }
}

locals {
  hosted_zone_id  = var.route53_zone_id != "" ? var.route53_zone_id : try(module.route53[0].zone_id, "")
  certificate_arn = var.acm_certificate_arn != "" ? var.acm_certificate_arn : try(module.acm[0].certificate_arn, "")
}

module "vpc" {
  source = "./modules/vpc"

  environment = var.environment
  vpc_cidr    = var.vpc_cidr
}

module "vpc_endpoints" {
  source = "./modules/vpc_endpoints"

  environment              = var.environment
  vpc_id                   = module.vpc.vpc_id
  private_subnet_ids       = module.vpc.private_subnet_ids
  private_route_table_ids  = module.vpc.private_route_table_ids
}

module "ecr" {
  source = "./modules/ecr"

  environment = var.environment
  repo_names  = [var.ecr_backend_repo_name, var.ecr_frontend_repo_name]
}

module "rds" {
  source = "./modules/rds"

  environment          = var.environment
  vpc_id               = module.vpc.vpc_id
  private_subnet_ids   = module.vpc.private_subnet_ids
  db_name              = var.db_name
  db_username          = var.db_username
  db_instance_class    = var.db_instance_class
  multi_az             = var.multi_az
  deletion_protection  = var.db_deletion_protection
  backup_retention_period = var.backup_retention_period
  performance_insights_enabled = var.performance_insights_enabled
}

module "elasticache" {
  source = "./modules/elasticache"

  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  node_type          = var.redis_node_type
}

module "ecs" {
  source = "./modules/ecs"

  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  public_subnet_ids  = module.vpc.public_subnet_ids

  backend_image       = var.backend_image
  frontend_image      = var.frontend_image

  db_host             = module.rds.db_endpoint
  redis_host          = module.elasticache.redis_endpoint
  db_secret_arn       = module.rds.db_secret_arn
  db_name             = var.db_name
  db_username         = var.db_username

  asg_min_capacity    = var.asg_min_capacity
  asg_max_capacity    = var.asg_max_capacity
  asg_desired_capacity = var.asg_desired_capacity
}

module "alb" {
  source = "./modules/alb"

  environment       = var.environment
  vpc_id            = module.vpc.vpc_id
  public_subnet_ids = module.vpc.public_subnet_ids

  backend_target_group_arn  = module.ecs.backend_target_group_arn
  frontend_target_group_arn = module.ecs.frontend_target_group_arn

  certificate_arn   = local.certificate_arn
  log_bucket_id     = aws_s3_bucket.alb_logs.id
}

module "waf" {
  count  = var.waf_enabled ? 1 : 0
  source = "./modules/waf"

  environment  = var.environment
  alb_arn      = module.alb.alb_arn
  allowed_cidrs = var.allowed_cidrs
}

module "route53" {
  count  = var.domain_name != "" && var.route53_zone_id == "" ? 1 : 0
  source = "./modules/route53"

  domain_name = var.domain_name
  environment = var.environment
}

module "acm" {
  count  = var.domain_name != "" && var.acm_certificate_arn == "" ? 1 : 0
  source = "./modules/acm"

  domain_name    = var.domain_name
  hosted_zone_id = local.hosted_zone_id
  environment    = var.environment
}

resource "aws_route53_record" "alb" {
  count   = var.domain_name != "" ? 1 : 0
  zone_id = local.hosted_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = module.alb.alb_dns_name
    zone_id                = module.alb.alb_zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "alb_www" {
  count   = var.domain_name != "" ? 1 : 0
  zone_id = local.hosted_zone_id
  name    = "www.${var.domain_name}"
  type    = "A"

  alias {
    name                   = module.alb.alb_dns_name
    zone_id                = module.alb.alb_zone_id
    evaluate_target_health = true
  }
}

resource "aws_s3_bucket" "alb_logs" {
  bucket = "${var.environment}-scoopdope-alb-logs"

  tags = {
    Name        = "${var.environment}-scoopdope-alb-logs"
    Environment = var.environment
  }
}

resource "aws_s3_bucket_public_access_block" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  rule {
    id     = "expire-logs"
    status = "Enabled"

    expiration {
      days = 90
    }
  }
}

resource "aws_s3_bucket_policy" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  policy = data.aws_iam_policy_document.alb_logs.json
}

data "aws_elb_service_account" "main" {}

data "aws_iam_policy_document" "alb_logs" {
  statement {
    effect = "Allow"
    principals {
      type        = "AWS"
      identifiers = [data.aws_elb_service_account.main.arn]
    }
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.alb_logs.arn}/*"]
  }
}

module "monitoring" {
  source = "./modules/monitoring"

  environment   = var.environment
  alarm_email   = var.sns_alarm_email
  alb_arn_suffix = module.alb.alb_arn_suffix
}

module "oidc" {
  source = "./modules/oidc"

  github_org  = var.github_org
  github_repo = var.github_repo
}
