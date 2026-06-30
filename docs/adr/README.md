# Architecture Decision Records (ADRs)

This directory captures the architecture decisions that shape the scoopdope platform. ADRs help new contributors understand the context behind major technical choices and avoid repeating the same debates later.

## What is an ADR?

An ADR records an important decision, the problem that triggered it, the alternatives considered, and the expected consequences. The goal is to preserve reasoning over time instead of relying on tribal knowledge.

## Format

Each ADR uses a lightweight structure with the following sections:

- **Status**: Accepted, Proposed, Deprecated, or Superseded
- **Context**: The problem or situation requiring a decision
- **Decision**: The choice that was made
- **Alternatives Considered**: The options that were evaluated
- **Consequences**: Positive, negative, and neutral outcomes
- **References**: Relevant documentation or resources

## Numbering Convention

- ADRs are numbered sequentially starting at ADR-001.
- The filename should match the number and a short descriptive slug, for example ADR-002-redis-caching-strategy.md.
- When a decision is superseded, the newer ADR should explicitly mention the earlier record.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-001](./ADR-001-soroban-smart-contracts-vs-horizon.md) | Use Soroban smart contracts over Horizon-only transactions | Accepted |
| [ADR-002](./ADR-002-redis-caching-strategy.md) | Use Redis caching with explicit TTL policy | Accepted |
| [ADR-003](./ADR-003-socketio-realtime-vs-polling.md) | Use Socket.IO for real-time notifications instead of polling | Accepted |
| [ADR-004](./ADR-004-typeorm-vs-prisma.md) | Use TypeORM for the backend ORM | Accepted |
| [ADR-005](./ADR-005-token-economics.md) | scoopdope Token (BST) Economics | Accepted |

## Creating New ADRs

When making a significant architectural decision:

1. Create a new ADR file with the next sequential number.
2. Use the same structure: Context, Decision, Alternatives Considered, Consequences, and References.
3. Update this index so the decision is discoverable.
4. Review the ADR with the team before marking it as Accepted.
