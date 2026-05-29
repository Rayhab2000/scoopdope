locals {
  allowed_cidrs = length(var.allowed_cidrs) > 0 ? var.allowed_cidrs : ["0.0.0.0/0"]
}

resource "aws_wafv2_web_acl" "main" {
  name        = "${var.environment}-scoopdope-waf"
  description = "WAF for Scoopdope ${var.environment}"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "IPRateLimit"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.environment}ScoopdopeIPRateLimit"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "SQLInjectionProtection"
    priority = 2

    action {
      block {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesSQLiRuleSet"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.environment}ScoopdopeSQLInjection"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "CommonAttackProtection"
    priority = 3

    action {
      block {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"
        excluded_rule {
          name = "SizeRestrictions_BODY"
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.environment}ScoopdopeCommonAttack"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "KnownBadInputs"
    priority = 4

    action {
      block {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.environment}ScoopdopeKnownBadInputs"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.environment}ScoopdopeWAF"
    sampled_requests_enabled   = true
  }

  tags = {
    Name        = "${var.environment}-scoopdope-waf"
    Environment = var.environment
  }
}

resource "aws_wafv2_web_acl_association" "main" {
  resource_arn = var.alb_arn
  web_acl_arn  = aws_wafv2_web_acl.main.arn
}
