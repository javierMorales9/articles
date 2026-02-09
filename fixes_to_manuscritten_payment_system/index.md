# Series Structure

## 1. Series spine

- Core pain or risk the entire series revolves around
  - **Silent undercharging/incorrect accounting under concurrency**: when many independent requests hit the same “balance” rows, you can be wrong without errors, dashboards, or obvious symptoms.
- One-sentence articulation of the "fire" the reader should feel
  - **If your product mutates money-like counters (credits/quotas/inventory), burst traffic can make you wrong in ways that look “fine” until you reconcile.**
- Series context (why this series exists)
  - A customer using an API-driven automated flow created ~**1,000** cards in ~**one second**.
  - Cards were created, but **credits barely decreased**, revealing a concurrency bug (lost updates) in the credit charging path.

## 2. Article map

### Article 1

- Working title
  - **“Transactions Aren’t Enough: The Lost-Update Bug That Undercharged Credits”**
- Core pain / risk exposed
  - Under bursty API traffic (e.g., hundreds/thousands of independent requests per second), your “available credits” can drift and you **undercharge**—quietly.
- What false assumption this article challenges
  - “If it’s inside a transaction, it’s safe.”
- Why this article matters on its own
  - It names the failure mode product engineers routinely ship by accident: **shared aggregate mutations without a serialization strategy**.
- Optional: high-level actionable direction (response to pain)
  - Define the invariant in plain language (“what must never be wrong”), and treat “balance update” as a critical section—not just another write.

### Article 2

- Working title
  - **“Reproducing Concurrency Bugs Without Lying to Yourself (k6 + Invariants)”**
- Core pain / risk exposed
  - Concurrency bugs are hard to reproduce and easy to dismiss; “it passed tests” becomes an illusion when the test doesn’t encode the accounting math.
- What false assumption this article challenges
  - “If it’s flaky, it’s not real” / “Load tests are just for performance, not correctness.”
- Why this article matters on its own
  - It gives a mindset for building **proof-oriented** tests: deterministic inputs + teardown checks that catch silent corruption.
- Optional: high-level actionable direction (response to pain)
  - Make the test assert **conservation** (expected deltas) rather than “no errors happened”.

### Article 3

- Working title
  - **“Making Card Creation + Deletion Atomic: A Postgres Locking Strategy That Holds Under Burst”**
- Core pain / risk exposed
  - “Just add a lock” can create deadlocks, latency spikes, or throughput collapse—yet without locks, correctness isn’t real.
- What false assumption this article challenges
  - “Row locks are simple” / “We can lock ‘whatever we touch’ and be done.”
- Why this article matters on its own
  - It teaches a portable decision: for one critical flow (automated card creation + deletion), choose the **serialization key**, pick a **lock order**, and handle contention predictably.
- Optional: high-level actionable direction (response to pain)
  - Decide (1) your critical section boundary, (2) lock ordering, and (3) what you will retry vs fail fast.

### Article 4

- Working title
  - **“Production Is Messier: Retries, ‘Normal Saves’, Monitoring, and the Next Bottleneck”**
- Core pain / risk exposed
  - Even after you “fix the race condition”, production gives you new failure modes: lock contention, transient DB errors, accidental stale overwrites, and unclear signals about what’s actually happening.
- What false assumption this article challenges
  - “Once it works in a test, it will keep working in production.”
- Why this article matters on its own
  - It’s practical advice for product engineers: how to keep a concurrency fix durable without turning the product into a fragile, high-latency system.
- Optional: high-level actionable direction (response to pain)
  - Treat transient DB contention as expected (retry), enforce “only credit paths may write credit columns”, monitor lock waits, and keep a correctness-oriented load test as a regression gate.

## 3. Series coherence

- How the articles relate to each other
  - Article 1 creates the tension (silent undercharging via lost updates).
  - Article 2 turns the tension into a repeatable proof (reproduction + invariants).
  - Article 3 gives the core design decision (serialization/locking strategy) for one focused flow: automated card creation + deletion.
  - Article 4 makes it durable (retries + persistence guardrails + monitoring + “what breaks next” thinking).
- Why reading more than one compounds value
  - Each article adds a missing piece of “correctness under load” that’s insufficient alone: diagnosis → proof → design → durability.

## 4. Editorial guardrails

- Topics explicitly excluded from the series
  - Purchases/Stripe flows and compensation logic (we will not use them to explain the core idea).
  - One-time campaign activation semantics and “bulk charge” behavior.
  - Single-card campaigns and their special-case lifecycle.
  - UI/UX for campaign editors, envelope design tooling, or unrelated platform features.
  - Generic “Postgres performance tuning” not tied to the concurrency correctness problem.
- Types of articles this series must NOT become
  - Generic “how to use Postgres locks” tutorials without the billing/concurrency trigger.
  - Tip lists without a motivating failure mode.
  - Internal changelog-style “we changed X, then Y” without a reader-facing pain.

## 5. Next steps

- Which article should be written first
  - **Article 1** (it establishes the incident, the risk, and the invariant the rest of the series defends).
- Which prompt to run next for that article
  - Create `fixes_to_manuscritten_payment_system/post1/` and run `prompts/3_article-context-extractor.md` to produce `fixes_to_manuscritten_payment_system/post1/context.md`.
