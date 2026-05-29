output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "alb_dns_name" {
  description = "Application Load Balancer DNS name"
  value       = module.alb.alb_dns_name
}

output "alb_zone_id" {
  description = "ALB hosted zone ID for Route53 alias records"
  value       = module.alb.alb_zone_id
}

output "db_endpoint" {
  description = "RDS database endpoint"
  value       = module.rds.db_endpoint
  sensitive   = true
}

output "db_secret_arn" {
  description = "ARN of the Secrets Manager secret for the RDS master password"
  value       = module.rds.db_secret_arn
  sensitive   = true
}

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint"
  value       = module.elasticache.redis_endpoint
  sensitive   = true
}

output "github_actions_role_arn" {
  description = "IAM role ARN for GitHub Actions OIDC — set as AWS_ROLE_ARN secret"
  value       = module.oidc.role_arn
}

output "ecr_repository_urls" {
  description = "ECR repository URLs for backend and frontend"
  value       = module.ecr.repository_urls
}

output "sns_topic_arn" {
  description = "SNS topic ARN for CloudWatch alarm notifications"
  value       = module.monitoring.sns_topic_arn
}

output "route53_name_servers" {
  description = "Route53 hosted zone name servers (configure at domain registrar)"
  value       = try(module.route53[0].name_servers, [])
}

output "certificate_arn" {
  description = "ACM certificate ARN"
  value       = local.certificate_arn
}
