# Contributing to scoopdope

Thank you for considering a contribution to scoopdope! This document covers everything you need to get started: development environment setup, branching conventions, commit message format, how to run every test suite, and the pull-request review process.

---

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Branching Strategy](#branching-strategy)
- [Commit Message Format](#commit-message-format)
- [Running Tests](#running-tests)
- [Pull-Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Reporting Issues](#reporting-issues)

---

## Development Setup

### Prerequisites

| Tool | Version |
|---|---|
| Node.js | v18 or higher |
| npm | v9 or higher |
| PostgreSQL | v12 or higher |
| Rust | v1.75 or higher |
| Stellar CLI | v21.5.0 |
| Docker | Optional — simplifies local DB/Redis |

### 1. Fork and clone

```bash
git clone https://github.com/<your-username>/scoopdope.git
cd scoopdope
```

### 2. Install Node.js dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
# Open .env and fill in DATABASE_HOST, DATABASE_NAME, JWT_SECRET,
# STELLAR_SECRET_KEY, STELLAR_NETWORK, and NEXT_PUBLIC_API_URL
```

### 4. Start dependent services (Docker)

```bash
docker compose up -d postgres redis
```

Or configure a local PostgreSQL instance and Redis server manually using the values from your `.env`.

### 5. Start the backend in development mode

```bash
npm run dev:backend
# REST API: http://localhost:3000
# Swagger UI: http://localhost:3000/api/docs
```

### 6. Start the frontend in development mode

```bash
npm run dev:frontend
# App: http://localhost:3001
```

### 7. Build smart contracts (optional for backend-only work)

```bash
rustup target add wasm32-unknown-unknown
./scripts/build.sh
```

---

## Project Structure

```
scoopdope/
├── apps/
│   ├── frontend/    # Next.js 14 (TypeScript)
│   └── backend/     # NestJS REST API (TypeScript)
├── contracts/       # Soroban smart contracts (Rust)
├── scripts/         # Build and deploy helpers
├── docs/            # Extended documentation
└── .github/         # CI/CD workflows and PR templates
```

---

## Branching Strategy

All work happens on short-lived feature branches. Never push directly to `main`.

| Prefix | When to use |
|---|---|
| `feature/` | New functionality |
| `fix/` | Bug fixes |
| `chore/` | Maintenance tasks (deps, config, CI) |
| `docs/` | Documentation-only changes |
| `test/` | Adding or updating tests with no production code changes |
| `refactor/` | Code restructuring with no behaviour change |

### Examples

```
feature/stellar-nft-certificates
fix/csv-import-empty-row-crash
chore/upgrade-nestjs-10
docs/contributing-guide
test/stellar-indexer-integration
```

Branch names must be lowercase and use hyphens as separators (no underscores, no spaces).

---

## Commit Message Format

This project follows the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification.

### Structure

```
<type>(<scope>): <short summary>

[optional body]

[optional footer(s)]
```

### Types

| Type | When to use |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation changes only |
| `test` | Adding or correcting tests |
| `refactor` | Code change that is neither a fix nor a feature |
| `chore` | Build process, dependency updates, tooling |
| `ci` | Changes to CI/CD configuration |
| `perf` | Performance improvements |

### Scopes (common)

`backend`, `frontend`, `contracts`, `stellar`, `import-export`, `auth`, `courses`, `ci`, `deps`

### Examples

```
feat(stellar): add NFT certificate minting via Soroban
fix(import-export): reject CSV rows with missing course_title
docs(contributing): add commit message guide
test(stellar-indexer): add integration tests for event polling
chore(deps): upgrade @stellar/stellar-sdk to 12.1.0
```

Breaking changes must include `BREAKING CHANGE:` in the commit footer:

```
feat(auth)!: replace JWT with Stellar wallet signatures

BREAKING CHANGE: existing JWT tokens are no longer accepted.
Clients must re-authenticate using wallet-signed messages.
```

---

## Running Tests

### Backend (NestJS / Jest)

```bash
# Run all backend unit and integration tests
npm run test --workspace=apps/backend

# Run tests in watch mode during development
npm run test:watch --workspace=apps/backend

# Generate coverage report
npm run test:cov --workspace=apps/backend
```

### Frontend (Next.js / Jest + React Testing Library)

```bash
# Run all frontend tests
npm run test --workspace=apps/frontend
```

### Smart Contracts (Rust / cargo test)

```bash
# Run tests for all contracts
cargo test --workspace

# Run tests for a single contract
cargo test -p analytics
cargo test -p token
```

### Linting and formatting

```bash
# Lint all TypeScript (backend + frontend)
npm run lint

# Format all TypeScript
npm run format

# Check Rust formatting
cargo fmt --check

# Run Clippy static analysis
cargo clippy -- -D warnings
```

All of the above are enforced by CI on every push and pull request. **Do not open a PR with failing lint or test runs.**

---

## Pull-Request Process

1. **Branch off main** — ensure your branch is up-to-date with the latest `main` before opening a PR.

   ```bash
   git fetch origin
   git rebase origin/main
   ```

2. **Self-review your diff** — check for accidental debug logs, commented-out code, or unrelated changes.

3. **Fill in the PR template** — include a summary of changes, the issue(s) being fixed (use `Closes #<number>`), and what you tested manually.

4. **Ensure CI passes** — all GitHub Actions workflows (build, test, lint) must be green. Fix failures before requesting a review.

5. **Request a review** — assign at least one reviewer. For backend changes touching Stellar/Soroban logic, tag a maintainer familiar with the stellar module.

6. **Address feedback** — push additional commits (do not force-push after review has started). Mark conversations as resolved once the change is applied.

7. **Squash on merge** — PRs are merged with "Squash and merge" to keep `main` history linear.

---

## Code Style

- **TypeScript** — follow the ESLint and Prettier configuration in the repo root. Run `npm run format` before committing.
- **NestJS** — use `@Injectable()` services, constructor injection, and NestJS-idiomatic module structure.
- **Tests** — co-locate spec files with source files (`*.spec.ts`). Use `jest.fn()` / `jest.spyOn()` for mocking. Avoid over-mocking; prefer shallow integration tests where practical.
- **Rust** — run `cargo fmt` and `cargo clippy` before pushing. Fix all Clippy warnings.
- **No secrets in code** — never commit real secret keys, passwords, or private keys. Use `.env` or environment variable injection.

---

## Reporting Issues

Open a GitHub issue with a clear title and description. Include:

- Steps to reproduce (if a bug)
- Expected vs. actual behaviour
- Relevant logs or stack traces
- Environment details (OS, Node version, network: testnet/mainnet)

Use the appropriate label: `bug`, `feature`, `docs`, `testing`, `stellar`, or `priority: high/medium/low`.

---

*Built with ❤️ on the Stellar network.*
