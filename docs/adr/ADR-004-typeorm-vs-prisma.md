# ADR-004: Use TypeORM for the backend ORM

## Status

Accepted

## Context

The backend needs a relational data layer for courses, users, access controls, and audit logs. We considered several ORMs and database access strategies, including Prisma and raw SQL repositories.

Key requirements:
- Strong integration with NestJS and existing decorators
- Maintainable entity and migration workflow
- Clear support for relational joins and soft-delete style updates
- A straightforward path for the current team to contribute safely

## Decision

We use TypeORM for the backend ORM and repository layer, rather than switching to Prisma at this stage.

## Alternatives Considered

- Prisma with schema-first migrations and generated client types
- Drizzle or other lightweight query builders
- Hand-authored SQL repositories with no ORM abstraction

## Consequences

**Positive:**
- The current codebase already uses TypeORM entities and repository injection cleanly
- Developers can work with familiar NestJS decorators and repository patterns
- The database model remains readable and consistent with the existing architecture

**Negative:**
- TypeORM has a smaller ecosystem story than Prisma for some newer workflows
- Schema changes require careful migration planning and validation
- Some developer experience gaps remain around generated types and query ergonomics

**Neutral:**
- The current stack remains compatible with PostgreSQL and existing deployment tooling
- A future migration to Prisma would be a deliberate, scoped refactor rather than a short-term change

## References

- [TypeORM Documentation](https://typeorm.io)
- [NestJS TypeORM Integration](https://docs.nestjs.com/techniques/database)
- [scoopdope backend entities](../../apps/backend/src)
