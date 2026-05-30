output "alb_dns_name" {
  description = "ALB DNS name"
  value       = aws_lb.main.dns_name
}

output "alb_arn" {
  description = "ALB ARN"
  value       = aws_lb.main.arn
}

output "alb_zone_id" {
  description = "ALB hosted zone ID for Route53 alias records"
  value       = aws_lb.main.zone_id
}

output "alb_arn_suffix" {
  description = "ALB ARN suffix for CloudWatch metric dimensions"
  value       = aws_lb.main.arn_suffix
}
