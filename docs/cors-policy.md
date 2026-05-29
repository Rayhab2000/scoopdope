# CORS Policy

The backend enforces a strict Cross-Origin Resource Sharing (CORS) policy configured entirely via environment variables.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `CORS_ORIGINS` | `http://localhost:3001` | Comma-separated list of allowed origins |
| `CORS_CREDENTIALS` | `false` | Whether to allow cookies/auth headers cross-origin |
| `CORS_MAX_AGE` | `86400` | Preflight cache duration in seconds (24 h) |

### Example `.env`

```env
CORS_ORIGINS=https://app.scoopdope.com,https://admin.scoopdope.com
CORS_CREDENTIALS=true
CORS_MAX_AGE=86400
```

## Behaviour

- **Development** (`NODE_ENV != production`): all origins are allowed (`origin: true`) to ease local development.
- **Production** (`NODE_ENV=production`): only origins listed in `CORS_ORIGINS` are permitted.

Allowed HTTP methods: `GET HEAD PUT PATCH POST DELETE OPTIONS`

Allowed request headers: `Content-Type`, `Authorization`, `X-API-KEY`, `X-Webhook-Signature`

## Adding a new trusted origin

Append the URL to `CORS_ORIGINS` (comma-separated, no spaces) and redeploy:

```env
CORS_ORIGINS=https://app.scoopdope.com,https://admin.scoopdope.com,https://new-panel.scoopdope.com
```

## Security notes

- Never add `*` to `CORS_ORIGINS` in production — it defeats the policy.
- `CORS_CREDENTIALS=true` requires an explicit origin list; browsers reject wildcard + credentials.
- Preflight responses are cached for `CORS_MAX_AGE` seconds; lower this value if origins change frequently.
