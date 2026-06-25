# Deployment: Logging & Log Aggregation

This document describes logging configuration and the expected log aggregation pipeline for production deployments.

## Overview

The backend application logs to **stdout/stderr** within containers. Docker's logging driver rotates logs automatically to prevent unbounded disk growth. In production environments, a centralized log aggregation system should collect these logs from all service instances.

## Docker Logging Configuration

The `docker-compose.yml` configures log rotation for the backend service:

```yaml
logging:
  driver: 'json-file'
  options:
    max-size: '100m'    # Rotate when a single log file reaches 100 MB
    max-file: '5'       # Keep up to 5 rotated log files
```

### Log Rotation Parameters

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `max-size` | `100m` | Individual log file size limit before rotation |
| `max-file` | `5` | Number of rotated log files to retain (oldest are deleted) |
| `driver` | `json-file` | Native Docker JSON file driver for local log storage |

### Disk Space Calculation

With these settings, maximum local log storage is approximately:

```
100 MB × 5 files = 500 MB per container
```

For multi-instance deployments, multiply by the number of backend replicas.

## Log Format Configuration

The application supports two log output formats:

### 1. Text Format (Default)

Standard human-readable format with timestamps and context:

```
2024-06-25T12:00:00.000Z info: [RequestLogger] Incoming request GET /api/courses
2024-06-25T12:00:00.100Z info: [DatabaseService] Query completed in 98ms
2024-06-25T12:00:00.105Z info: [RequestLogger] Response sent 200
```

Set via environment variable:

```bash
LOG_FORMAT=text
```

### 2. JSON Format

Structured JSON output for machine parsing and centralized log aggregation:

```json
{"timestamp":"2024-06-25T12:00:00.000Z","level":"info","message":"Incoming request GET /api/courses","context":"RequestLogger"}
{"timestamp":"2024-06-25T12:00:00.100Z","level":"info","message":"Query completed in 98ms","context":"DatabaseService"}
```

Set via environment variable:

```bash
LOG_FORMAT=json
```

JSON format is automatically selected in **production** environments (`NODE_ENV=production`) unless explicitly overridden.

## Production Log Aggregation Pipeline

### Recommended Architecture

```
Backend Containers (stdout/stderr)
    ↓
Docker Logging Driver (json-file, rotated)
    ↓
Log Shipper (FluentBit, Filebeat, or CloudWatch Agent)
    ↓
Centralized Log Backend (CloudWatch, Loki, Splunk, etc.)
    ↓
Analytics & Alerting (Dashboards, Log Queries, Alarms)
```

### Example: AWS CloudWatch

Deploy the CloudWatch agent or use Elastic Container Service (ECS) native logging:

```json
{
  "logDriver": "awslogs",
  "options": {
    "awslogs-group": "/scoopdope/backend",
    "awslogs-region": "us-east-1",
    "awslogs-stream-prefix": "ecs"
  }
}
```

### Example: Grafana Loki (Docker Swarm)

Use the Loki Docker logging driver:

```yaml
logging:
  driver: loki
  options:
    loki-url: "https://loki.example.com:3100/loki/api/v1/push"
    loki-batch-size: "100"
    loki-external-labels: service=backend,env=production
```

## Monitoring Log Volume

Monitor these metrics to detect issues early:

1. **Log Lines Per Minute**: Spike in volume may indicate excessive logging or errors
2. **Disk Usage**: Validate rotation is working and space doesn't grow unbounded
3. **Error Rate**: Track ERROR and WARN log counts via aggregation backend
4. **Log Lag**: In real-time log streaming, monitor latency from container to backend

## Best Practices

1. **Always use JSON format in production** for structured log parsing
2. **Ensure centralized aggregation is deployed before production launch**
3. **Set up log-based alerts** for ERROR level logs and specific patterns (e.g., "OutOfMemory")
4. **Retain logs for at least 30 days** in the centralized backend for compliance
5. **Monitor disk space** on nodes to ensure rotation doesn't fill up local storage
6. **Test log aggregation** in staging before production deployment

## Troubleshooting

### Logs Growing Unbounded

**Symptoms:** Disk usage on node increases rapidly

**Cause:** Log driver not configured or rotation disabled

**Fix:** Verify `docker-compose.yml` includes logging configuration with `max-size` and `max-file`

### Missing Logs in Aggregation Backend

**Symptoms:** Some logs missing from centralized logging system

**Cause:** Log shipper not running or network connectivity issue

**Fix:**
- Verify log shipper container is running: `docker ps | grep fluentbit`
- Check network connectivity: `docker exec <shipper> curl <backend-url>`
- Review shipper logs: `docker logs <shipper>`

### High Disk Usage Despite Rotation

**Symptoms:** Disk usage near 100% even with rotation enabled

**Cause:** `max-file` setting too high or rotated files not being deleted

**Fix:** Reduce `max-file` value or `max-size` limit in `docker-compose.yml`

## Related Documentation

- [Monitoring & Observability](./monitoring-observability.md)
- [Environment Variables](./environment-variables.md)
- [Deployment Runbook](./deployment-runbook.md)
