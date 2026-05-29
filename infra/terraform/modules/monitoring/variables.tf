variable "environment" {
  description = "Environment name"
  type        = string
}

variable "alarm_email" {
  description = "Email address for SNS alarm notifications"
  type        = string
  default     = ""
}

variable "alb_arn_suffix" {
  description = "ALB ARN suffix for CloudWatch dimension"
  type        = string
}
