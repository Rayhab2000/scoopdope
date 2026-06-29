# ADR-002: Use Redis caching with an explicit TTL policy

## Status

Accepted

## Context

The backend serves repeated reads for course metadata, user dashboards, and frequently requested analytics. We needed a caching layer that could reduce database pressure without creating stale or inconsistent data.

Key requirements:
- Fast cache lookups for read-heavy endpoints
- Clear invalidation rules for course updates and user changes
- Low operational overhead for a small team
- A predictable policy for stale data expiration

## Decision

We use Redis as the shared cache layer and apply explicit TTLs to cache entries based on data volatility. Short-lived entries cover frequently changing data, while longer TTLs cover static content.

## Alternatives Considered

- In-memory caching only within a single Node process
- No caching and relying entirely on PostgreSQL reads
- CDN-style caching for public content only

## Consequences

**Positive:**
- Database load decreases for repetitive reads
- Common responses become faster for users and APIs
- TTLs make cache freshness easier to reason about than indefinite caching

**Negative:**
- Cache invalidation must be maintained carefully when content changes
- Redis adds another service to deploy and monitor
- Stale cache entries can still appear if invalidation misses occur

**Neutral:**
- The cache complements PostgreSQL rather than replacing it
- Some endpoints will still read from the database directly when freshness matters more than speed

## References

- [Redis Documentation](https://redis.io/docs)
- [NestJS Cache Module](https://docs.nestjs.com/techniques/caching)
- [scoopdope backend services](../../apps/backend)
