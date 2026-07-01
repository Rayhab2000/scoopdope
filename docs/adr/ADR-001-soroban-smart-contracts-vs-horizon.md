# ADR-001: Use Soroban smart contracts over Horizon-only transactions

## Status

Accepted

## Context

The platform needs to issue verifiable credentials and track learning progress on Stellar. We considered using Horizon-only transactions for simple account operations and Soroban smart contracts for logic that must be enforced on-chain.

Key requirements:
- Tamper-evident credential issuance
- Programmatic rules for course completion and reward eligibility
- Low-cost updates for repeated state changes
- A path to upgradeable or extensible on-chain logic over time

## Decision

We use Soroban smart contracts for credential and reward logic, rather than relying on Horizon-only transactions for the business rules that govern them.

## Alternatives Considered

- Horizon-only transactions with memo fields for credential references
- Off-chain logic in the backend with only a signed Stellar transaction for submission
- A hybrid approach that mixes Soroban and Horizon-only operations

## Consequences

**Positive:**
- Business rules can be enforced on-chain and verified independently of the backend
- Credential issuance and reward flows become more auditable and reproducible
- Future upgrades can add new rules without changing the external API contract

**Negative:**
- Smart contract development adds complexity compared with simple Horizon transactions
- Contract deployment and maintenance require a stronger Rust and Soroban skill set
- On-chain logic must be carefully designed to stay within Stellar resource limits

**Neutral:**
- The backend still coordinates user flows and stores metadata off-chain
- Some non-critical data remains in PostgreSQL for search and reporting

## References

- [Stellar Soroban Documentation](https://soroban.stellar.org)
- [Stellar Horizon API](https://developers.stellar.org/docs/learn/fundamentals/transactions)
- [scoopdope contract workspace](../../contracts)
