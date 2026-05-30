variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs"
  type        = list(string)
}

variable "public_subnet_ids" {
  description = "Public subnet IDs"
  type        = list(string)
}

variable "backend_image" {
  description = "Backend Docker image"
  type        = string
}

variable "frontend_image" {
  description = "Frontend Docker image"
  type        = string
}

variable "db_host" {
  description = "Database host"
  type        = string
}

variable "redis_host" {
  description = "Redis host"
  type        = string
}

variable "db_secret_arn" {
  description = "ARN of the Secrets Manager secret for DB password"
  type        = string
  default     = ""
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "Scoopdope"
}

variable "db_username" {
  description = "Database username"
  type        = string
  default     = "postgres"
}

variable "asg_min_capacity" {
  description = "Minimum number of ECS tasks"
  type        = number
  default     = 2
}

variable "asg_max_capacity" {
  description = "Maximum number of ECS tasks"
  type        = number
  default     = 10
}

variable "asg_desired_capacity" {
  description = "Desired number of ECS tasks"
  type        = number
  default     = 2
}
