output "waf_arn" {
  description = "WAF web ACL ARN"
  value       = aws_wafv2_web_acl.main.arn
}

output "waf_id" {
  description = "WAF web ACL ID"
  value       = aws_wafv2_web_acl.main.id
}
