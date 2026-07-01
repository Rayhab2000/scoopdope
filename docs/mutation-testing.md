# Mutation Testing Guide

## Overview

Mutation testing verifies test quality by introducing small code changes (mutations) and checking if tests catch them. This ensures tests are effective at detecting bugs.

## Setup

Mutation testing is configured using Stryker with the following setup:

- **Test Runner**: Jest
- **Mutator**: TypeScript
- **Reporters**: HTML, JSON, Clear Text, Progress
- **CI execution**: Weekly schedule plus pull requests that touch critical backend modules or their tests/configuration

## Running Mutation Tests

### Full mutation test suite
```bash
npm run test:mutation
```

### Generate HTML report
```bash
npm run test:mutation:report
```

The HTML report will be available at `coverage/mutation/index.html`

## Configuration

The Stryker configuration is in `stryker.conf.js` and is intentionally scoped to critical backend modules only:

- `apps/backend/src/auth/**/*.ts`
- `apps/backend/src/payments/**/*.ts`
- `apps/backend/src/certificates/**/*.ts`
- `apps/backend/src/waitlist/**/*.ts`

Excluded from mutation are tests, DTOs, entities, controllers, modules, index files, and type definition files so mutation effort focuses on business logic.

### Thresholds

- High: 80% (excellent)
- Medium: 60% (good)
- Low: 40% (acceptable)
- Break: 60% (CI fails below this score)

## CI Integration

GitHub Actions workflow: `.github/workflows/mutation.yml`

It runs:

- Weekly on Sunday at 02:00 UTC
- Manually via `workflow_dispatch`
- On pull requests that modify critical modules, related tests, or mutation configuration

The workflow also:

- Fails automatically when the mutation score drops below 60%
- Publishes the HTML/JSON report from `coverage/mutation/` as a GitHub Actions artifact

## Interpreting Results

- **Killed**: Mutation was caught by tests
- **Survived**: Mutation was not caught and indicates a test gap
- **Timeout**: Mutation caused an infinite loop or stalled execution
- **Compile Error**: Mutation caused invalid code

## Best Practices

1. Focus mutation testing on security-sensitive and payment-related logic
2. Improve tests where survivors appear repeatedly
3. Treat the mutation score threshold as a quality gate, not just a report
4. Expand scope only when runtime remains practical in CI

## Performance

- Mutation testing is slower than unit tests
- Scoping to critical modules keeps CI practical
- `maxConcurrentTestRunners` can be tuned if CI runtime changes
