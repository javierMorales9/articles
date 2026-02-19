# Article Structure

## Title + Hook + CTA (locked early)

### Locked decisions (do not drift)
- Working title (final): “How do you know your credits system is wrong under concurrency (before a customer finds it for you)?”
- Primary CTA (final): Continue to Post 2 (locking/retry decision).
- Hook (final; include verbatim in the article)
  - Pay‑per‑use payment systems are everywhere. Maybe it’s AI tokens, AWS‑style usage, or credits‑per‑action. The whole promise is simple: you only pay for what you use.
  - That model is great for users—flexible, predictable, no upfront commitment. But it’s harder to implement, because the billing state is variable and on‑demand: it’s a running counter being mutated in real time by production traffic.
  - The real problem with this kind of payment system is concurrency. Because do you know what happens when multiple requests try to update the same running counter at the same time? Exactly: race conditions. Naive implementations are not enough if you don’t want to end up writing emails like: “Hey—our app showed you had more credits than you really did. You actually owe us money.” Or the other version: “We charged you too much, we’re fixing it,” followed by refunds, invoices, awkward accounting, and a customer wondering if they can trust anything your dashboard says.
  - That’s exactly what happened to us in Manuscritten: our payment system was broken, and we didn’t find out until we started having some serious concurrency. And that’s the worst part about this kind of errors—they’re difficult to catch with normal unit tests.
  - In this article I’m going to explain how these problems work, how you can reproduce them effectively, and how you can include tests in your CI to catch this class of bugs in day‑to‑day development. But first, let me show you how our payment system works.

### Scope boundary (from Prompt 4; do not drift)
- In scope (explicit)
  - Pay-per-use “credits as a running counter” framing (transferable across products).
  - Automated campaign card creation + deletion flows (Manuscritten) as the concrete case.
  - The lost-update failure dance (race condition) and why it produces silent drift.
  - Why unit tests typically miss this class of bug.
  - Reproducing drift with a deterministic k6 harness and a correctness invariant.
  - Running the harness in CI as a guardrail.
- Out of scope (explicit)
  - Purchases/compensation and Stripe flows.
  - One-time campaign activation and single-card flows.
  - Deep Postgres internals and “which locking strategy to pick” (Post 2).

### Series role (so readers know what this is / isn’t)
- This post is the “make it fail on demand + build a guardrail” post.
- Post 2 is the “choose the concurrency strategy (serializable vs atomic update vs locks+retries) and why” post.

### Open loops introduced here (and where they close)
- “If unit tests miss this, what testing *does* work?” → closed in Section 6 + Section 7.
- “If concurrency breaks correctness, what do you do about it?” → intentionally left open; closed in Post 2.

## Introduction

### 1) What this section covers (talking points + explanation beats)
- Talking points (order)
  1) Credits systems are “money-like counters”: correctness is the product.
  2) Concurrency is the condition that turns “looks fine” into “silently wrong.”
  3) The cost of being wrong is human: awkward emails, refunds, and trust loss.
  4) The fix path starts before locking: make the bug reproducible and measurable.
- Explanation beats (no prose; what to do)
  - Start from the reader’s likely belief: “If billing is wrong, we’ll see errors.”
  - Counterexample: balances drift with no 500s; you find out when a customer complains or when numbers don’t match totals.
  - State the invariant in plain language: “credits deducted must equal the sum of costs for what you created.”
  - Tie to the series: “This post shows repro + guardrail; Post 2 shows the locking/retry decision.”
- Section takeaway (1 sentence, plain language)
  - “If your credits correctness depends on an interleaving, you need a reproducible concurrency harness—not more unit tests.”

### 2) What this section deliberately does NOT cover
- Any specific locking strategy details (Post 2).
- Any deep dive into payment providers or purchases.

### 3) Examples
- Primary example (continued through the whole article)
  - Manuscritten (anonymized customer): automated campaign traffic can burst into ~1,000 requests/second.
  - What “correct” means: the company’s available credits must match the sum of charged card totals (and owed totals if insufficient credits are allowed).
- Secondary examples (quick analogies only; no deep dive)
  - AI image generation priced “per image” and LLM tokens priced “per million tokens”.

### 4) Code to include (artifacts + explanation plan)
- No code block here; keep the intro conceptual.
- Optional: one small “terms box” table (not code) later reused in Section 1.

### 5) Visuals / figures
- Visual V1: a small table mapping “usage event” → “cost” (tokens/images/cards) to make the “meter” mental model concrete.

### 6) Concurrency “dance”
- Not yet; tease that a minimal two-request interleaving is coming (Section 3).

### 7) Open loops
- “Okay, but what does ‘credits system’ look like in a real product?” → Section 2.
- “What *exactly* is the race condition?” → Section 3.
- “How do we test this without flakiness?” → Section 6.

## Section 1 — The “running counter” (what credits systems really are)

### 1) What this section covers (talking points + explanation beats)
- Talking points (order)
  1) Define “credits” as a pay-per-use meter (not a subscription).
  2) Define what the balance represents: remaining capability (“what you can still do”).
  3) Define the core requirement: correctness under real traffic (“the number must be true”).
  4) Explain why this is harder than it sounds: variable costs, real-time charging, and reversals (deletions/refunds).
- Explanation beats
  - Reader belief: “It’s just decrementing a number.”
  - Counterexample: “decrementing a number” is exactly what breaks when two requests do it at once.
  - State the invariant: “the meter must equal the sum of usage events (modulo refunds/deletes).”
  - Tie back to hook consequences: the painful emails happen when the meter lies.
- Section takeaway
  - “A credits balance is a financial interface: treat it like a correctness boundary, not a UI convenience.”

### 2) What this section deliberately does NOT cover
- Ledger-based accounting vs counters (not needed for this series).
- Reconciliation strategies and backfills (tangent).

### 3) Examples
- Primary example (Manuscritten)
  - Usage event: “create a card (letter)”
  - Delete event: “delete a card (if allowed)”
  - Cost: depends on destination/type (just mention variability; no pricing deep dive).
- Secondary example (AI)
  - Usage event: “generate an image” or “tokens generated”
  - Delete/refund event: “refund credits on failed job” (mention only).

### 4) Code to include (artifacts + explanation plan)
- No product code yet. Keep this as a mental model + terms.
- Optional “terms box” (table)
  - Columns: `availableCredits`, `dueCredits` (owed), `charged vs owed`.
  - Use only what you plan to reference later (especially if you mention owed).

### 5) Visuals / figures
- Visual V2: “running counter” diagram:
  - Start `availableCredits = 100`
  - After one usage event costing 3: `availableCredits = 97`
  - After a delete/refund: `availableCredits` goes back up

### 6) Concurrency “dance”
- Not yet; promise: “we’ll show the smallest possible two-request dance next.”

### 7) Open loops
- “So what does Manuscritten actually do on card creation/deletion?” → Section 2.

## Section 2 — Manuscritten’s simplified credits flow (only what we need)

### 1) What this section covers (talking points + explanation beats)
- Talking points (order)
  1) Define the “victim”: Manuscritten’s credits system for pay-per-letter usage.
  2) Minimal flow: create card → compute cost → mutate company balance → persist → respond.
  3) Minimal reverse flow: delete card → reverse/adjust balance (if allowed) → persist.
  4) Briefly cover the insufficient-credits branch (only what’s needed later):
    - do not go negative
    - mark card as owed
    - track owed amount in `dueCredits`
  5) Emphasize the “shared counter” nature: all concurrent requests touch the same company balance.
- Explanation beats
  - Reader belief: “If we use a DB, it’ll serialize updates for us.”
  - Counterexample: the DB won’t magically protect you from stale reads + overwrites if you read/compute/write naively.
  - State the requirement: “balance mutations must be atomic with respect to each other.”
- Section takeaway
  - “Card creation/deletion is not ‘just CRUD’ when it mutates a shared balance.”

### 2) What this section deliberately does NOT cover
- One-time campaign activation (bulk charging) and single cards.
- Purchases/compensation flows.

### 3) Examples
- Primary example (Manuscritten; reuse later)
  - Company starts with `availableCredits = 100`, `dueCredits = 0`.
  - Two concurrent card-create requests, each costing 3 credits.
  - Correct end state after both: `availableCredits = 94`.
  - Broken end state (lost update): `availableCredits = 97`.
- Secondary example (insufficient credits; brief)
  - If `availableCredits = 2` and a card costs 3:
    - `availableCredits` stays at `2` (or goes to `0`, depending on model; but never below `0`)
    - `dueCredits += 3`
    - card becomes `owed`

### 4) Code to include (artifacts + explanation plan)
- CB1
  - Block ID: CB1
  - Snippet type: pseudocode
  - Location: (pseudocode only; no repo file)
  - Size guidance: ~10–15 lines
  - What the reader should notice
    - The “read → compute → write” pattern
    - The single shared counter (`availableCredits`) updated by many requests
  - Misconception corrected
    - “A transaction automatically prevents lost updates.”
  - Invariant protected
    - “Final balance equals initial minus total charged usage.”
  - What you will say immediately after the block
    - “This looks fine in a unit test, because unit tests don’t create contention.”
    - “Now let’s show the smallest interleaving that breaks it.”
- CB2
  - Block ID: CB2
  - Snippet type: before/after (tiny)
  - Location: `fix_manuscritten_payment_system/ref/packages/domain/company/Company.ts` — `Company.chargeCard`
  - Size guidance: ~10–20 lines around:
    - “has credits?” branch
    - “else: dueCredits + owed status” branch
  - What the reader should notice
    - Correctness rule: never let available go below 0
    - Owed is explicit state, not “negative credits”
  - Misconception corrected
    - “If the balance goes negative, we’ll notice” / “negative is fine temporarily.”
  - Invariant protected
    - “`availableCredits >= 0` and owed usage is tracked explicitly.”
  - What you will say immediately after the block
    - “This logic can be perfectly correct and still be wrong under concurrency if updates are lost.”

### 5) Visuals / figures
- Visual V3: 3-box flow:
  - Request arrives → cost computed → shared balance mutated
- Visual V4: state chart (tiny):
  - card payment status: `charged` vs `owed` (just two states)

### 6) Concurrency “dance”
- Not the full dance yet; set up that we’re about to show two requests colliding on the same shared balance.

### 7) Open loops
- “What does the failure actually look like step-by-step?” → Section 3.

## Section 3 — The minimal failure dance (lost update)

### 1) What this section covers (talking points + explanation beats)
- Talking points (order)
  1) Define “lost update” in one sentence (no jargon first): “one update overwrites another.”
  2) Walk the two-request dance with concrete values (100 → 97 written twice).
  3) Explain why it’s silent: both requests “succeed” (200 OK), but the ledger is wrong.
  4) Connect to why the bug appears “now”: bursts create contention; low concurrency hides it.
- Explanation beats
  - Reader belief: “If both requests returned 200, both charges happened.”
  - Counterexample: both requests *did* run, but one charge was overwritten.
  - State the invariant: “if two usage events cost 3 each, total deduction is 6, not 3.”
  - Tie to the hook: this is how you end up writing the awkward email.
- Section takeaway
  - “Race conditions can produce perfectly successful requests and still steal money from your billing model.”

### 2) What this section deliberately does NOT cover
- How to fix it (no locking strategy here; that’s Post 2).
- Isolation levels beyond what’s needed to explain the dance (keep it product-friendly).

### 3) Examples
- Primary micro-scenario (required; explicit numbers)
  - State: `availableCredits = 100`
  - Request A cost: 3
  - Request B cost: 3
  - Correct final: 94
  - Broken final (lost update): 97
- Burst scenario (required)
  - “Same bug, amplified”: 1,000 requests in a short window makes drift large enough to be undeniable.
  - Avoid inventing exact production drift; describe qualitatively:
    - “the mismatch becomes visible without manual forensics”

### 4) Code to include (artifacts + explanation plan)
- CB3
  - Block ID: CB3
  - Snippet type: SQL
  - Location: (illustrative SQL; no repo file)
  - Size guidance: ~10–15 lines
  - What the reader should notice
    - The anti-pattern is “SELECT then UPDATE with a computed value”
    - Without coordination, two transactions can both compute from the same starting value
  - Misconception corrected
    - “Using SQL makes it atomic by default.”
  - Invariant protected
    - “Total deductions must reflect all successful usage events.”
  - What you will say immediately after the block
    - “Now you know what breaks. Next: why unit tests don’t catch it reliably.”

### 5) Visuals / figures
- Visual V5 (must-have): two-lane timeline
  - Lane A: read(100) → compute(97) → write(97)
  - Lane B: read(100) → compute(97) → write(97)
  - End state: 97 (wrong)

### 6) Concurrency “dance” (explicit)
- Interleaving steps (Request A / Request B)
  1) Both read `availableCredits = 100`
  2) Both compute `next = 97`
  3) A writes 97
  4) B writes 97 (overwrites A’s update)
  5) End: only 3 credits deducted (wrong)
- Pseudocode version
  - `balance = read(company.availableCredits)`
  - `balance = balance - cost`
  - `write(company.availableCredits = balance)`
- Equivalent SQL version (simplified)
  - `SELECT available_credits FROM company WHERE id = ...;`
  - `UPDATE company SET available_credits = $computed WHERE id = ...;`
- Invariant commentary
  - Violated: “deduction == sum(costs of successful requests)”

### 7) Open loops
- “Why didn’t our tests catch this earlier?” → Section 4.
- “How do we reproduce this on demand?” → Section 5 + Section 6.

## Section 4 — Why unit tests don’t catch this class of bug

### 1) What this section covers (talking points + explanation beats)
- Talking points (order)
  1) Unit tests validate logic in isolation; they don’t validate interleavings.
  2) Concurrency bugs are “schedule-dependent”: they appear only under certain timing.
  3) If you rely on randomness (“just run it 1,000 times”), you’ll get flaky tests, not confidence.
  4) The right shift: test the invariant under real contention with a harness designed for concurrency.
- Explanation beats
  - Reader belief: “We can just add more unit tests around the credit function.”
  - Counterexample: the credit function is correct; the bug is two requests colliding around it.
  - Invariant restated: the end state must match totals.
  - Tie forward: “we’re going to build a deterministic harness that makes the collision happen.”
- Section takeaway
  - “If your bug depends on timing, your tests must control timing—or at least control the oracle.”

### 2) What this section deliberately does NOT cover
- Full taxonomy of testing types (keep it tight).
- Full load-testing tutorial (no “how to k6” detour).

### 3) Examples
- Show “good unit test passes”
  - Single request: 100 → 97; test passes.
- Show “real world fails”
  - Two requests: expected 94; observed 97.

### 4) Code to include (artifacts + explanation plan)
- CB4
  - Block ID: CB4
  - Snippet type: pseudocode
  - Location: (pseudocode only)
  - Size guidance: ~8–15 lines
  - What the reader should notice
    - Unit test asserts local behavior, not global invariant under contention
  - Misconception corrected
    - “If the pure function is correct, the system is correct.”
  - Invariant protected
    - “System-level end-state equals totals.”
  - What you will say immediately after the block
    - “So we need a system-level test with a deterministic oracle.”

### 5) Visuals / figures
- Visual V6: “Unit test world” vs “Production world” diagram
  - Single lane vs many lanes racing

### 6) Concurrency “dance”
- Reference back to Section 3; no new dance needed here.

### 7) Open loops
- “Okay, so what invariant do we check?” → Section 5.

## Section 5 — Turn drift into a failing signal (the invariant)

### 1) What this section covers (talking points + explanation beats)
- Talking points (order)
  1) Define what you can measure reliably after a chaotic run.
  2) Choose an oracle that doesn’t depend on “knowing the exact interleaving”.
  3) For Manuscritten: totals from the database (charged/owed) become the oracle.
  4) Express the invariant(s) in one line each.
- Explanation beats
  - Reader belief: “We need to simulate the exact schedule to prove correctness.”
  - Counterexample: you can instead assert end-state equality against an independently computed total.
  - Invariants (plain language)
    - “Available credits match initial credits minus charged total.”
    - (If owed exists) “Due credits match owed total.”
  - Tie to next section: “k6 gives us concurrency; the invariant gives us truth.”
- Section takeaway
  - “A good concurrency test doesn’t predict the schedule; it asserts a schedule-independent truth.”

### 2) What this section deliberately does NOT cover
- Business pricing details and cost formulas beyond what’s needed to compute totals.
- Complicated multi-campaign reconciliation (out of scope).

### 3) Examples
- Primary invariant example (use the same numbers)
  - Initial credits: 100
  - Charged total after run: 6
  - Expected available: 94
  - Observed available in broken system: 97 (fail)
- Optional owed example (brief)
  - If some requests created owed cards, due credits should equal owed total.

### 4) Code to include (artifacts + explanation plan)
- CB5
  - Block ID: CB5
  - Snippet type: before/after (or direct excerpt)
  - Location:
    - `fix_manuscritten_payment_system/ref/apps/web/src/tests/performance/concurrent_credits_flow.ts` — `teardown()`
  - Size guidance: ~15–25 lines around:
    - reading `/api/public/cards/summary`
    - reading `/api/public/company-data`
    - computing `expectedAvailable`
    - failing if mismatch
  - What the reader should notice
    - The oracle uses DB totals, not “what we think happened”
    - The invariant is stated as math and enforced automatically
  - Misconception corrected
    - “Concurrency tests have to be flaky.”
  - Invariant protected
    - “availableCredits == initialCredits - chargedTotal”
  - What you will say immediately after the block
    - “Now that we have a truth oracle, we can make contention happen on purpose.”

### 5) Visuals / figures
- Visual V7: invariant box
  - `expectedAvailable = initialCredits - chargedTotal`
  - `expectedDue = owedTotal`
- Visual V8: small table
  - `initialCredits`, `chargedTotal`, `availableCredits`, `delta`

### 6) Concurrency “dance”
- Not required here; this section is about the oracle, not the schedule.

### 7) Open loops
- “How do we generate enough contention deterministically?” → Section 6.

## Section 6 — The deterministic k6 harness (how we reproduce it on demand)

### 1) What this section covers (talking points + explanation beats)
- Talking points (order)
  1) What k6 gives you: real concurrent HTTP traffic against your real server.
  2) What k6 does *not* give you by default: determinism.
  3) How we make it deterministic enough for correctness:
    - deterministic recipient generation per VU/iteration
    - deterministic oracle (Section 5)
  4) What to focus on (for this article’s scope):
    - automated campaign create/delete pressure
    - (optionally) ignoring other scenarios in the file; readers can extend later
- Explanation beats
  - Reader belief: “Load tests are just for performance.”
  - Counterexample: they can be correctness harnesses if you assert invariants at the end.
  - Tie to the hook: this is how you catch drift before the customer does.
- Section takeaway
  - “k6 turns concurrency from ‘rare production accident’ into ‘repeatable lab condition’.”

### 2) What this section deliberately does NOT cover
- Full k6 tutorial (keep it anchored to the harness design choices).
- How to design the final locking strategy (Post 2).

### 3) Examples
- Primary “burst” example (grounded, not over-specified)
  - Run k6 with multiple virtual users creating cards concurrently for the same company/campaign.
  - The exact number of VUs/duration is adjustable; the key is: enough overlap to collide on the same balance.
- Determinism example
  - Show how per-VU+iteration seeding produces repeatable recipients.

### 4) Code to include (artifacts + explanation plan)
- CB6
  - Block ID: CB6
  - Snippet type: excerpt
  - Location:
    - `fix_manuscritten_payment_system/ref/apps/web/src/tests/performance/concurrent_credits_flow.ts`
      - `export const options = ...` (only the automated create/delete scenarios)
      - `buildRecipient()` (the deterministic seed line)
  - Size guidance: ~15–25 lines (focus on determinism + concurrency parameters)
  - What the reader should notice
    - Concurrency is explicit (VUs, duration, overlapping scenarios)
    - Recipient generation is seeded deterministically (not “random random”)
  - Misconception corrected
    - “If randomness is involved, the test can’t be trusted.”
  - Invariant protected
    - “The harness produces stable inputs so failures indicate drift, not noise.”
  - What you will say immediately after the block
    - “Now you can run it and get the same failure until you actually fix the system.”
- CB7
  - Block ID: CB7
  - Snippet type: excerpt
  - Location:
    - `fix_manuscritten_payment_system/ref/apps/web/src/tests/performance/run_k6_with_seed.ts` — `main()` (local mode high level)
  - Size guidance: ~15–25 lines around:
    - starting Postgres container
    - running migrations
    - seeding company + campaigns
    - running k6
  - What the reader should notice
    - It’s an end-to-end harness: disposable DB + deterministic seed + traffic + oracle
  - Misconception corrected
    - “This is too hard to run locally / too expensive to automate.”
  - Invariant protected
    - “A reproducible environment makes correctness testable.”
  - What you will say immediately after the block
    - “Once it runs locally, making it a CI gate is just wiring.”

### 5) Visuals / figures
- Visual V9: pipeline diagram
  - Seed DB → Start server → Run k6 → Teardown asserts invariant

### 6) Concurrency “dance”
- Optional mini-dance (only if helpful)
  - Show that k6 doesn’t “coordinate” the interleaving; it just increases overlap probability.
  - The determinism comes from input generation + deterministic oracle.

### 7) Open loops
- “How do we ensure this runs often, not just once?” → Section 7.

## Section 7 — Make it day-to-day: run it in CI (and what “green” means)

### 1) What this section covers (talking points + explanation beats)
- Talking points (order)
  1) Why “we ran it once” isn’t enough (regressions happen).
  2) What “green” means: the invariant held under contention for this run.
  3) When to run it (trade-off): not on every commit, but on meaningful integration points (e.g., PRs to staging).
  4) How failures surface: failing the job with a clear mismatch message.
- Explanation beats
  - Reader belief: “This will make CI too slow.”
  - Counterexample: run it where it matters (staging PRs) to catch the class of drift bugs before release.
  - Tie to the series: this guardrail is what makes Post 2’s fixes meaningful (they stay fixed).
- Section takeaway
  - “The goal isn’t to ‘test more’; it’s to make correctness regressions loud and automatic.”

### 2) What this section deliberately does NOT cover
- CI optimization in general (runners, caching).
- External-mode k6 runs and secrets management (too much for this post).

### 3) Examples
- Failure example (message-level)
  - “availableCredits mismatch: expected X actual Y”
  - Explain how this points to drift, not flakiness (because oracle is deterministic).

### 4) Code to include (artifacts + explanation plan)
- CB8
  - Block ID: CB8
  - Snippet type: excerpt
  - Location:
    - `fix_manuscritten_payment_system/ref/.github/workflows/ci.yml` — `k6` job (trigger + run step)
  - Size guidance: ~15–25 lines showing:
    - conditional trigger (PR to staging)
    - install k6
    - run `npm run -w apps/web k6:run`
  - What the reader should notice
    - k6 runs as an explicit job gate, not “developer manual step”
    - The harness is runnable in CI because it seeds itself
  - Misconception corrected
    - “This kind of test can’t run in CI.”
  - Invariant protected
    - “No merge to staging without passing the drift oracle.”
  - What you will say immediately after the block
    - “Now the system has a guardrail; next post is about which concurrency strategy makes it pass.”

### 5) Visuals / figures
- Visual V10: “guardrail” figure
  - PR → CI → k6 gate → merge

### 6) Concurrency “dance”
- Not needed; this is operationalization.

### 7) Open loops
- “So what do we actually change in the DB/code to make the test pass?” → Post 2.

## Conclusion

### 1) What this section covers (talking points + explanation beats)
- Talking points (order)
  1) Re-state the problem in one line: silent drift under concurrency.
  2) Re-state the method: invariant → deterministic harness → CI gate.
  3) Make the payoff explicit: fewer “trust-damaging” customer conversations.
  4) Tee up the next post: now that we can measure drift, we can compare fixes.
- Explanation beats
  - Close the “guessing” loop: reproducibility turns fear into engineering.
  - Confirm what the reader can now do: build their own guardrail for a credits/balance system.
- Section takeaway
  - “Once you can reproduce drift deterministically, you can fix it confidently—and keep it fixed.”

### 2) What this section deliberately does NOT cover
- The actual fix choice and implementation details (Post 2).

### 3) Examples
- Return to the email pain
  - After guardrail: the goal is “never write that email again.”

### 4) Code to include (artifacts + explanation plan)
- No new code; keep the conclusion punchy.

### 5) Visuals / figures
- Optional: a compact recap diagram
  - Invariant → harness → CI gate → confidence

### 6) Concurrency “dance”
- None.

### 7) Open loops
- Explicitly leave open (to Post 2)
  - “Okay, but which concurrency strategy should I use?” → Post 2.

### CTA plan
- Primary CTA: Read Post 2.
- Micro-CTA copy direction (not prose): “I’ll compare serializable vs atomic updates vs locks+retries, and why we picked what we picked.”

## What This Article Does NOT Cover
- Purchases/compensation and Stripe flows.
- One-time campaign activation and single-card flows.
- Deep Postgres internals; this post focuses on reproducibility + guardrails, not the final locking design.
- A full k6 tutorial (only what’s load-bearing for correctness).
