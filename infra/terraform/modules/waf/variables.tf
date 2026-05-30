variable "environment" {
  description = "Environment name"
  type        = string
}

variable "alb_arn" {
  description = "ALB ARN to associate the WAF with"
  type        = string
}

variable "allowed_cidrs" {
  description = "List of CIDR blocks allowed to access the ALB"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}
