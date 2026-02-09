# Feature Context

## 1. Feature overview

- What the feature does
  - Makes **automated campaign card creation via the public API** charge credits **correctly under concurrent requests**, preventing “lost updates” on a company’s credit balance.
- Before vs after behavior
  - Before: the API card-creation endpoint reused logic that had historically run in more sequential contexts (e.g., CSV uploads), so when a customer sent a burst (≈1,000 requests in ~1 second) the system created cards but **subtracted far fewer credits than expected** (silent undercharging).
  - After: each API card creation charges credits inside a **single transaction** that acquires **row-level locks** (company → campaign) so concurrent requests serialize the credit mutation; the resulting invariant is that the company’s credits reflect the sum of created cards (with `dueCredits` as the “insufficient credits” escape hatch, but not the focus of this article).

## 2. Design and implementation decisions

- Chosen design
  - **Row-level locking in Postgres** using `SELECT ... FOR UPDATE` for the rows that represent the shared aggregates being mutated:
    - Lock the **company** row first (credits live on the company).
    - Lock the **campaign** row next (campaign credit counters + variables are also mutated as part of card creation).
  - Perform the entire “compute cost → update domain objects → persist card + updated credit fields” inside a **single DB transaction**.
  - Wrap credit-sensitive transactions in a **retry helper** for transient lock/serialization failures (so the product sees fewer user-visible errors under contention).
- Alternatives considered
  - Other concurrency strategies were considered at a high level (e.g., different database isolation/locking approaches); the deeper comparison and rationale is intentionally deferred to the later “locking strategy” article in this series.
- Key trade-offs
  - Correctness is prioritized over maximal throughput: concurrent requests may block and/or retry, increasing tail latency under bursts, but preventing silent accounting drift.

## 3. Constraints and assumptions

- Technical constraints
  - Many independent API requests can target the same company/campaign concurrently (burst traffic).
  - Credit mutation is a shared-aggregate update (read-modify-write) and must be treated as a critical section.
  - The system must remain correct even when address validation and other per-request work happens around the credit mutation.
- Assumptions made
  - It is acceptable to serialize credit mutations per company/campaign using DB locks.
  - Transient contention errors (deadlocks/serialization/lock timeouts) can be handled with bounded retries rather than failing immediately.

## 4. Testing and validation

- Testing approach
  - Use **k6 load tests** that create cards concurrently and assert accounting invariants at teardown by comparing the company’s `availableCredits` to the expected spend.
- Relevant test types
  - Performance/concurrency tests:
    - `apps/web/src/tests/performance/create_cards_for_campaign.ts` — concurrent `POST /api/public/card` traffic with a teardown check that `afterCredits == beforeCredits - expectedTotalCost`.
    - `apps/web/src/tests/performance/run_k6_with_seed.ts` — a local runner that can seed data and run the bundled k6 scripts (used for repeatability; broader scenarios exist but are out of scope for this article).

## 5. Operational expectations

- Expected load or volume
  - Designed to remain correct under bursty automated traffic (real incident involved ~1,000 card-creation requests in about one second).
- Performance or concurrency notes
  - Under contention, requests may block on row locks and/or retry; this is expected behavior to preserve correctness.

## 6. Codebase map

### Key files

- `apps/web/src/app/api/public/card/route.ts` — public HTTP entrypoint for API-driven card creation; calls the tRPC card creation handler.
- `apps/web/src/server/api/card/recipients.ts` — card creation logic (`save`) that performs the credit mutation inside a transaction with locks + retry.
- `packages/db/repositories/company/companyRepo.ts` — company repository; provides `findForUpdate()` (row lock) and separate save modes (`saveWithCredits` vs `saveWithoutCredits`).
- `packages/db/repositories/campaign/campaignRepo.ts` — campaign repository; provides `findForUpdate()` and separate save modes for credit vs non-credit updates.
- `packages/db/withLockRetry.ts` — bounded retry helper for retryable Postgres lock/serialization errors.
- `packages/domain/company/Company.ts` — domain rules for charging credits (`availableCredits`) and accumulating owed credits (`dueCredits`).
- `packages/domain/card/Card.ts` — card model including credit cost computation (used when charging).
- `apps/web/src/tests/performance/create_cards_for_campaign.ts` — k6 script focused on concurrent API card creation and credit invariant checking.

### Key functions / modules

- `recipients.save` — creates a card for a campaign and atomically updates company/campaign credit counters within a locked transaction.
- `CompanyRepository.findForUpdate` — acquires a row-level lock on the company record to serialize credit mutations.
- `CampaignRepository.findForUpdate` — acquires a row-level lock on the campaign record to serialize campaign credit/variable mutations.
- `CompanyRepository.saveWithCredits` / `saveWithoutCredits` — enforces that only credit-touching code paths persist credit fields (prevents stale overwrites).
- `CampaignRepository.saveWithCredits` / `saveWithoutCredits` — same persistence invariant for campaign credit fields.
- `withLockRetry` — retries transactions on retryable contention/serialization failures (bounded attempts + backoff).
- `Company.chargeCard` — domain operation that decides how a card affects `availableCredits` vs `dueCredits` and updates campaign counters accordingly.

