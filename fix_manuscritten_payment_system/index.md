# Series Structure

## 0. Reader alignment (4 questions)
- 1) Common ground
  - You build product APIs where “balances” exist (credits, quotas, inventory) and traffic can spike in bursts; you’re not trying to become a database specialist to ship correctness.
- 2) Broken/improved requirement + why it matters
  - Requirement: credits must stay consistent with the sum of charged cards under concurrency; otherwise you under/over-charge and erode customer trust (money-like correctness).
- 3) How the series helps
  - It shows how to (a) make the bug reproducible with an invariant-based harness, and (b) choose and justify a practical concurrency-control strategy that matches your product constraints.
- 4) Concurrency correctness takeaway
  - Concurrency bugs don’t announce themselves; correctness comes from explicit invariants + a reproducible harness + a database-level serialization boundary (plus retries) — not from “careful code”.

## 1. Series spine
- Core pain or risk the entire series revolves around
  - Silent undercharging/overcharging caused by concurrent requests mutating a shared balance (lost updates) — especially when “rare concurrency” becomes “sudden burst”.
- One-sentence articulation of the "fire" the reader should feel
  - Your credits system can be wrong for months, and the day a single customer sends a burst, it will embarrass you in production.

## 2. Article map

### Article 1
- Working title
  - “Your credits drifted — and you didn’t notice: reproducing lost updates in automated campaigns with a deterministic k6 harness”
- Core pain / risk exposed
  - You can’t fix what you can’t reproduce; concurrency bugs hide behind “it doesn’t happen often”.
- What false assumption this article challenges
  - “If it’s wrong, we’ll see errors” / “low concurrency means we’re safe”.
- Why this article matters *on its own*
  - It gives you a concrete way to turn a vague suspicion (“credits feel off”) into a failing, repeatable test with a crisp invariant.
- Specific insight / capability gained
  - What ability the reader gains
    - Define a money-like invariant for your credits/balance system, then build a deterministic concurrency test that fails on drift.
  - Trigger conditions/events where it applies
    - When a “balance” is updated by many concurrent API calls, especially under burst traffic or retries.
- Scope boundary (flows/endpoints/behaviors)
  - In scope (explicit)
    - Lost-update failure mode in credits (`100 -> 97` written twice).
    - The invariant to assert for the simplified harness: `credits_after = credits_before - total_cost_of_new_cards`.
    - k6 test strategy used in Manuscritten (`concurrent_credits_flow`): deterministic work allocation under concurrency and an end-state check.
    - CI guardrail: running the k6 flow for staging-targeting PRs.
  - Out of scope (explicit)
    - Picking the final locking strategy in detail (that’s Article 2).
    - Purchases/compensation, one-time campaign activation, and single-card flows.
    - Deep Postgres internals beyond what’s required to understand “why this fails”.
- Optional: high-level actionable direction (only as a response to the pain, not a how-to)
  - If you can’t reproduce drift on demand, you’re not debugging — you’re guessing.

### Article 2
- Working title
  - “Choosing a concurrency boundary for money-like counters: serializable, atomic updates, advisory locks, queues — and why we picked row locks + retries”
- Core pain / risk exposed
  - There are many “reasonable” fixes, and picking the wrong one either doesn’t fix correctness or makes production worse (timeouts, deadlocks, complexity).
- What false assumption this article challenges
  - “ACID means I’m safe” / “just use transactions” / “one clever SQL statement will solve it everywhere”.
- Why this article matters *on its own*
  - It gives a practical decision framework for choosing a concurrency-control strategy that fits a product, not a textbook.
- Specific insight / capability gained
  - What ability the reader gains
    - Compare concurrency-control options for shared counters, understand trade-offs, and implement the “least bad” strategy with lock ordering + bounded retries.
  - Trigger conditions/events where it applies
    - When you must preserve correctness under bursty concurrency and you’re deciding between DB-level strategies vs app-level serialization (queues).
- Scope boundary (flows/endpoints/behaviors)
  - In scope (explicit)
    - Alternatives and trade-offs in Manuscritten’s context:
      - Serializable transactions
      - Atomic credit decrement updates
      - Advisory locks
      - Row-level locks (`FOR UPDATE`) with strict ordering (company → campaign)
      - Queues/single-writer approach
    - Why retries are necessary (lock contention, deadlocks, serialization failures) and what “bounded retry” looks like.
    - Persistence discipline to prevent stale overwrites (credit-aware vs non-credit saves).
  - Out of scope (explicit)
    - General-purpose database benchmarking.
    - Purchases/compensation details and Stripe flows.
- Optional: high-level actionable direction (only as a response to the pain, not a how-to)
  - Pick one serialization boundary, enforce it consistently, and make contention a first-class case (retries + observability).

## 3. Series coherence
- How the articles relate to each other
  - Article 1 creates the undeniable failing signal (drift under concurrency) and a guardrail you can keep forever.
  - Article 2 turns that signal into a decision: how to pick and justify a concurrency boundary that eliminates drift without making the system brittle.
- Why reading more than one compounds value
  - Without Article 1, Article 2 is theory without proof; without Article 2, Article 1 is a failing test without a principled fix path.

## 4. Editorial guardrails
- Topics explicitly excluded from the series
  - Generic “Postgres locking guide” without tying it to the pain of silent drift.
  - Deep dives into unrelated subsystems (envelopes tooling, robot controller).
  - Purchases/compensation and Stripe/payment UI implementation details.
- Types of articles this series must NOT become (e.g. generic how-tos, tip lists without a trigger)
  - “How to use k6” as a standalone tutorial.
  - “Top 10 locking tips” lists.
  - Internal changelog-style documentation (“we added retries”, “we added locks”) without the motivating risk.

## 5. Next steps
- Which article should be written first
  - Article 1 (repro + invariant harness) — it sets stakes and makes the rest feel inevitable.
- Which prompt to run next for that article (Prompt 4 → Prompt 5 → Prompt 6)
  - Run Prompt 4 in `fix_manuscritten_payment_system/post1/`, then Prompt 5, then Prompt 6.
