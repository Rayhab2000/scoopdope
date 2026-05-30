variable "environment" {
  description = "Environment name"
  type        = string
}

variable "repo_names" {
  description = "List of ECR repository names to create"
  type        = list(string)
}
