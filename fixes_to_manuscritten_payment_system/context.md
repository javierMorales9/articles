# Editorial Routing Context (Phases A + B)

This file captures the **editorial router output** for the series folder.
It intentionally covers **only**:
- Phase A — Scope & Shape
- Phase B — Insight & Value

It is *not* a post outline, and it does not include implementation walkthroughs.

---

## Series context (what happened)

- Manuscritten charges “credits” when clients create letters/cards via the API.
- A specific customer uses **automated campaigns** (API-driven), so card creations arrive as **many independent requests**.
- One day they effectively did a bulk send via the API: ~**1,000** card creations in about **one second**.
- After the burst, the newly created cards existed, but the company’s **available credits had barely gone down** compared to the expected total cost — a classic **lost update** situation caused by concurrency.

---

## Phase A — Scope & Shape

- Decision: **SERIES**
- Confidence: **High**
- Structural signals (human + code-level)
  - Incident driver: a customer burst (≈ **1,000** independent API letter/card creations in ~**1 second**) exposed credit undercharging due to concurrent requests.
  - Distinct milestones that each deserve their own post:
    - Reproduce the race condition with k6 performance tests.
    - Evaluate Postgres concurrency/locking strategies and choose one.
    - Implement locking + persistence invariants in the codebase.
    - Add database-level visibility/monitoring to validate what’s happening under load.
    - Add retry behavior for transient lock/serialization failures.
    - Make the fix provable in CI (run the load test as a check).
  - Broad surface area (from code review): touches API endpoints, DB/repositories/transactions, domain credit rules, worker behavior, docs, and CI/test tooling.

---

## Phase B — Insight & Value

- Core insight(s)
  - **Transactions aren’t enough** for balance/credits correctness under concurrency: you need an explicit serialization point (e.g., row-level locks) *and* a persistence strategy that prevents stale overwrites.
  - **Prove concurrency fixes, don’t just argue them**: encode invariants in load tests (k6) and run them in CI so regressions become visible immediately.
- Pain / risk exposed
  - Under bursty automation traffic, credit mutations experienced **lost updates**, leading to **incorrect available credits** (and therefore incorrect charging/accounting).
- Transferability
  - Applies to many product systems that mutate shared aggregates under load: credits/quotas, inventory, seats, rate limits, wallets, and billing counters—especially when exposed via APIs and automations.
- Non-applicability
  - If you cannot rely on relational locking semantics (non-SQL stores) or you cannot tolerate serialization/retries at request time, you may need a different architecture (e.g., queue/command processing or a ledger/event-based model).
- Editorial verdict: **STRONG**
  - High-stakes correctness + a crisp, transferable lesson (“lost updates despite transactions”) + an executable proof strategy (k6/CI).

### Inputs captured from the author (you)

- Target reader: **product engineers** building real systems with billing/credits-style invariants.
- “Most surprising” takeaway: **lost updates despite transactions**.
- Known-good before: owed/compensation edge cases were understood and already working.
- Tradeoffs accepted: a mix of **latency**, **throughput constraints**, **added complexity**, and **retries** to preserve correctness.
- If the load target became ~10,000 req/s:
  - First step: write/extend k6 tests to measure the current system’s limit and failure modes.
  - Likely direction if needed: add a **queue** (or similar buffering/serialization layer) depending on the observed bottleneck.
