# Feature Context

## 0. Scope
- Form: SERIES
- In-scope flows (explicit)
  - Automated campaign card creation and deletion under burst concurrency (API-driven) and their credit mutations.
  - Credit mutation correctness as a “money-like counter”: preventing lost updates and balance drift.
  - The “insufficient credits” branch for automated campaigns:
    - `availableCredits` never goes below `0`
    - `dueCredits` increases
    - card payment status changes (charged vs owed)
  - Database-level serialization for these mutations (row-level locks) and bounded retries on lock/serialization contention.
  - A minimal reproducibility harness using k6 (`concurrent_credits_flow`) to detect drift with an end-state invariant.
- Out-of-scope flows (explicit)
  - Purchases, compensation, and “credit settlement” flows (Stripe checkout, purchase persistence, compensation across campaigns).
  - One-time campaign activation semantics.
  - Single-card campaign flows.
  - Campaign “assigned credits” reporting beyond what’s required to explain automated create/delete correctness.
  - Envelope tooling/UI (`apps/envelopes-cli`, envelope preview/download).
  - Non-credit subsystems (robot print pipeline, design tooling, integrations beyond “cards arrive concurrently”).

## 1. Feature overview
- What the feature does
  - Hardens automated-campaign credit mutations (card create/delete) against concurrency bugs (lost updates) under bursts.
  - Adds a reproducible k6 harness (`concurrent_credits_flow`) to detect drift with a simple invariant.
  - Serializes the shared balance mutation at the database boundary (row locks) and retries on transient contention/serialization failures.
- Before vs after behavior
  - Before: concurrent requests could read the same `availableCredits` and write back a stale value (lost update), undercharging credits and drifting from card totals.
  - After: credit mutations execute inside transactions that lock the relevant rows (company first, then campaign) and retry on retryable lock/serialization errors; k6 tests validate invariants and can run in CI.

## 2. Design and implementation decisions
- Chosen design
  - “Make drift detectable”: add a deterministic k6 test (`concurrent_credits_flow`) that asserts an end-state invariant: `credits_after = credits_before - total_cost_of_new_cards`.
  - “Serialize the balance mutation at the DB boundary” (for automated create/delete):
    - Use transactions plus row-level locks (`SELECT ... FOR UPDATE`) on the `company` row (and then the `campaign` row) for credit mutations.
    - Persist credit columns only from credit-aware code paths to avoid stale overwrites:
      - `CompanyRepository.saveWithCredits()` vs `saveWithoutCredits()`
      - `CampaignRepository.saveWithCredits()` vs `saveWithoutCredits()`
  - “Fail less under contention”: wrap these transactions in `withLockRetry` for retryable Postgres errors (lock timeout, deadlock, serialization failures).
- Alternatives considered
  - Tested:
    - Serializable isolation / forcing serialization at the transaction level.
    - Atomic SQL updates (e.g. `UPDATE ... SET available_credits = available_credits - X`) as a way to avoid read-modify-write lost updates.
  - Compared (in-scope for the editorial discussion, even if not implemented as a full prototype):
    - Postgres advisory locks keyed by company/campaign.
    - A queue / single-writer model (serialize mutations in the app layer).
    - Row-level locks with a fixed lock ordering + retries (chosen).
- Key trade-offs
  - Row locks keep the correctness boundary close to the data but require discipline (consistent lock ordering, and careful persistence to avoid “stale overwrite”).
  - Retries reduce user-visible errors under contention, but must be limited/bounded and applied only where correctness needs serialization.
  - k6 tests are heavier than unit tests (infra/Docker/CI time) but catch the class of bugs that normal tests miss.

## 3. Constraints and assumptions
- Technical constraints
  - Credits are a shared mutable balance (`availableCredits` / `dueCredits`) whose correctness must hold under concurrent card create/delete requests.
  - `availableCredits` must never go below `0`. When funds are insufficient, the mutation must:
    - increase `dueCredits`, and
    - mark the card as owed (payment status changes),
    - while keeping company/campaign counters consistent.
  - The mutation touches multiple aggregates (company + campaign + card payment status), so correctness needs multi-row serialization, not a single-field update in isolation.
  - Postgres concurrency behavior under load (deadlocks/serialization failures) must be handled without turning bursts into user-facing failures.
- Assumptions made
  - A deterministic “expected total spend” can be computed for test runs and checked after concurrent operations complete.
  - Locking order can be standardized (company → campaign, and for some flows company → all campaigns) to reduce deadlock risk.

## 4. Testing and validation
- Testing approach
  - Add a k6 script (`concurrent_credits_flow`) that creates/deletes cards concurrently and asserts an end-state credit invariant for automated campaigns.
  - Provide a seeded runner that can bring up a disposable DB, run migrations, seed deterministic data, start the server, and run k6.
  - Run k6 in CI for staging-targeting PRs (and via manual workflow dispatch).
- Relevant test types
  - Performance/concurrency tests: `apps/web/src/tests/performance/*.ts` (k6).
  - Existing integration tests were adjusted where needed (not the primary regression harness for this bug class).

## 5. Operational expectations
- Expected load or volume
  - Automated campaign API can experience burst traffic (e.g. ~1,000 card creations per second for a single company).
- Performance or concurrency notes
  - Credit mutations for automated create/delete are serialized per company (and campaign) to prevent drift.
  - Contention is treated as expected under bursts; retry is preferred over surfacing transient DB contention errors.

## 6. Codebase map

### Key files
- `docs/credits-system.md` — narrative map of credit mutations and invariants; lock strategy notes.
- `docs/k6-load-test.md` — how the k6 tests work and how to run them (local/external).
- `packages/domain/company/Company.ts` — core credit mutation rules (`chargeCard`, `unchargeCard`, `compensate`).
- `packages/domain/campaign/Campaign.ts` — campaign state and credit counters (`assignedCredits`, `dueCredits`) touched by charging/un-charging.
- `packages/db/repositories/company/companyRepo.ts` — `findForUpdate` and `saveWithCredits`/`saveWithoutCredits` split.
- `packages/db/repositories/campaign/campaignRepo.ts` — `findForUpdate`, `lockCompanyCampaigns`, and `saveWithCredits`/`saveWithoutCredits`.
- `packages/db/withLockRetry.ts` — bounded retry helper for retryable Postgres contention/serialization errors.
- `apps/web/src/server/api/card/recipients.ts` — card create/delete flows; credit mutation and compensation under locks + retries.
- `apps/web/src/server/api/campaign/crud.ts` — campaign-level entrypoints that create cards for automated flows (used only where it touches automated card creation).
- `apps/web/src/tests/performance/*` — k6 scripts + runner + bundling.
- `.github/workflows/ci.yml` — CI pipeline that runs k6 for PRs targeting `staging` (and via `workflow_dispatch`).

### Key functions / modules
- `Company.chargeCard(card, campaign)` — applies credit charge semantics per sending mode/state; may move credits into `dueCredits`.
- `Company.unchargeCard(card, campaign)` — reverses charge when allowed (e.g. not worked), updating company+campaign counters.
- `CompanyRepository.findForUpdate(id)` — locks a company row (`FOR UPDATE`) as the first step in credit-sensitive transactions.
- `CampaignRepository.findForUpdate(id)` — locks a campaign row (`FOR UPDATE`) after company lock.
- `withLockRetry(fn, options)` — retries a transaction on retryable DB errors (deadlock/serialization/lock contention).

## 7. Technical scope map
- In-scope technical areas (names only)
  - Credit invariants
  - Concurrency failure modes (lost update / write skew)
  - Postgres row-level locking (`FOR UPDATE`)
  - Lock ordering and deadlock avoidance
  - Retry on contention/serialization failures
  - Deterministic concurrency test harness (k6) + CI guardrails
  - Insufficient-credit behavior: owed cards + `dueCredits`
- Out-of-scope technical areas (names only)
  - Stripe billing UI/embedded checkout implementation details
  - Purchases and compensation flows
  - Envelope rendering/download tooling
  - Robot execution / printing pipeline
  - Non-credit campaign editor UX
