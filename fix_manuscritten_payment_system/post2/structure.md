# Article Structure

## Title + Hook + CTA (locked early)
- Title (final): How do you choose a concurrency strategy for a credits system (without becoming a database expert)?
- Primary CTA (final): Comment: what’s the worst failure mode for you—waiting, retries/aborts, or accidental bypass—and why?
- Hook schema (locked; order + examples; do not rewrite in Prompt 5)
  1) Series carry-over (where we left Post 1)
     - Example (locked; verbatim):
       - In Post 1 we showed the nightmare scenario: two perfectly “successful” operations happening at the same time can make your pay‑per‑use balance wrong—
         without throwing a single error. Then we built a test that reproduces that failure on demand, so it stops being a production ghost.
  2) Benefit (what this post gives you)
     - Example (locked; verbatim):
       - By the end of this post, you’ll know how to choose a concurrency strategy for a credits system—and justify it—without needing to become a database expert.
  3) New problem (the decision trap)
     - Example (locked; verbatim):
       - Now comes the part nobody warns you about: there are multiple “correct-sounding” ways to handle concurrency, and the choice changes your system’s failure
         mode.
  4) Options list (explicit menu)
     - Example (updated at end of Prompt 5 to match final sections/order):
       - We’ll compare six approaches: lock the row, lock an advisory key, encode “no negative balance” as a single atomic update, let Postgres abort conflicting
         transactions (serializable), pre-allocate/spend credit chunks (token bucket / Redis), or serialize the whole thing through a queue/single-writer.
  5) Decision criteria
     - Example (locked; verbatim):
       - We’ll judge them on correctness (multi-entity consistency), predictability under bursts, operational pain (retries/timeouts), and how easy they are for a
         product team to apply everywhere.
  6) Open-loop transition
     - Example (locked; verbatim):
       - But before we compare anything, let me briefly set the example we’ll reuse for every option—so you can feel the difference in behavior, not just read
         theory.

## Scope boundary (do not drift)
- In scope (explicit)
  - Automated campaign card creation + deletion (Manuscritten) as the concrete case.
  - The decision problem: picking a concurrency contract for a money-like counter.
  - Options compared: row-level locks, advisory locks, atomic updates, serializable isolation, chunk leasing/token bucket (Redis or in-memory), queue/single-writer.
  - Decision criteria: correctness, predictability under bursts, operational pain, and team-discipline risk.
  - Postgres-only: this post assumes Postgres semantics/behavior for locking, isolation, and observability queries.
- Out of scope (explicit)
  - Purchases/compensation and Stripe flows.
  - One-time campaign activation and single-card flows.
  - Deep Postgres internals (keep it product-engineer friendly).

## Introduction
- Narrative goal: re-open the loop from Post 1 (we can reproduce drift) and define the new job: choose a coordination strategy that stays correct under bursts.
- Core insight/pain surfaced: you’re choosing a failure mode (wait vs abort/retry vs bypass/bug), not choosing “a lock”.
### Phase 1 — Paragraph skeleton (1 line each)
1) Series carry-over: recap Post 1 (lost update + test that reproduces it).
2) Concrete picture: two simultaneous requests modifying the same `available_credits` (coordination is mandatory).
3) Decision paragraph: multiple “correct-sounding” strategies exist; each implies a different failure mode + ops burden (Postgres-specific).
4) Open loop: we’ll compare 6 approaches with one yardstick + rubric; but first, define the yardstick we’ll reuse.

### Phase 2 — Paragraph details (what to say; bullets only)

#### Paragraph 1 — Series carry-over
- Acknowledge series context (only for Post 2+).
- Restate the nightmare scenario in vivid terms:
  - two “successful” operations at the same time can make a balance wrong without errors.
- Mention we built a test to reproduce it deterministically (so it stops being a production ghost).
- Keep it short; no solutions yet.

#### Paragraph 2 — Concrete picture (“coordination is mandatory”)
- Paint the core situation:
  - two requests, same company, both trying to mutate `available_credits` concurrently.
- State the unavoidable need:
  - you need coordination so the shared counter doesn’t drift.
- Don’t tease the menu yet; just set the intuition:
  - “if two things touch the same value at the same time, something has to decide the order.”

#### Paragraph 3 — Decision paragraph (“many ways; different pain”)
- Start from Paragraph 2: “OK, we agree we need coordination.”
- State the trap:
  - there are many ways to implement coordination, and they don’t fail the same way.
- High-level menu (no deep details yet; just name the shapes):
  - Wait/serialize in Postgres (row locks / advisory locks)
  - Make the update atomic (conditional update / reservation)
  - Let Postgres detect conflicts (serializable + retries)
  - Amortize contention (chunk leasing/token bucket)
  - Move serialization outside the DB (queue/single-writer)
- Explicit Postgres-only note:
  - “this post is Postgres-specific (locking/isolation/observability queries differ across databases).”

#### Paragraph 4 — Open loop (transition into Section 1)
- Make the promise concrete:
  - we’ll compare these options using one shared scenario and a small rubric.
- End with the open loop:
  - “but first, let me set the example we’ll reuse for every option—so you can feel the difference in behavior, not just read theory.”

## Section 1 — The yardstick (one scenario, one invariant, real-world criteria)
- Narrative goal: ground the entire comparison in one concrete example and a small set of decision criteria.
- Type of reasoning: setup + measurement.
- Type of code involved: none required (conceptual only); optional simplified SQL later in option sections.
- Possible visual: a boxed “scenario + invariants + criteria” card.

### Phase 1 — Paragraph skeleton (1 line each)
1) Minimal model: what state we care about (company credits + card payment status).
2) Two reusable micro-scenarios (same shape, different numbers) we’ll run through every strategy.
3) The invariants: what “correct” means (no negative, owed rules, no lost update).
4) The naive baseline: how lost updates happen (even when everything returns 200 OK).
5) Why we need a yardstick (the hard part is choosing the pain).
6) The rubric: how we’ll score every option (incl. burst + latency scaling).
7) Scope guardrail applied to the example (what we intentionally ignore).
8) Transition into Option 1 (row-level locks): “watch what happens to the second request.”

### Phase 2 — Paragraph details (what to say; bullets only)

#### Paragraph 1 — Minimal model
- Entities (simplified): `company` and `card`.
- In-scope fields (only what we need for the comparison):
  - `company.available_credits` (the shared counter).
  - `company.due_credits` (what increases when we can’t fully charge).
  - `card.payment_status` (`charged | owed | uncharged`) (observable outcome).
- In-scope operations:
  - automated campaign **card creation** and **card deletion** only.
- One-line purpose: keep the world small so the concurrency behavior is obvious and comparable.

#### Paragraph 2 — Two reusable micro-scenarios (with numbers)
- Shared setup (applies to both examples):
  - Two requests arrive “at the same time”.
  - Each request tries to create 1 card.
  - `cardCost = 7`.
  - We track end state of `available_credits`, `due_credits`, and each card’s `payment_status`.
- Example A (enough credits; shows the “both charged” path still needs correctness under concurrency):
  - Start: `available_credits = 100`, `due_credits = 0`.
  - Expected: both cards end `charged`.
  - End: `available_credits = 86`, `due_credits = 0`.
- Example B (insufficient credits; shows owed + dueCredits behavior under concurrency):
  - Start: `available_credits = 10`, `due_credits = 0`.
  - Expected: one card `charged` (10 → 3); second card `owed`.
  - Owed rule (locked for this post): if `available_credits < cardCost`, we do **not** deduct anything; we mark the card as `owed` and do `due_credits += cardCost` (here: `+7`).
  - End: `available_credits = 3`, `due_credits = 7`.

#### Paragraph 3 — Invariants (definition of “correctness”)
- Invariant 1 (hard safety): `available_credits` never goes below 0.
- Invariant 2 (accounting across outcomes):
  - `charged` ⇒ deduct full `cardCost`.
  - `owed` ⇒ do **not** deduct available credits; increase `due_credits` by the full `cardCost` (as per Example B).
- Invariant 3 (single-commit consistency):
  - The card’s `payment_status` must match what happened to `available_credits`/`due_credits`.
  - No “charged card” without the corresponding deduction; no “owed card” without the corresponding due increase.
- Invariant 4 (no lost update / serializability-at-the-business-level):
  - Under concurrency, the final state must match *some* serial order (A then B, or B then A) — not a blended drift state.

#### Paragraph 3.5 — Ledger note (orthogonal to the strategy)
- A durable ledger/audit trail is orthogonal to the concurrency strategy:
  - you can build a ledger on top of row locks, atomic reservation, or serializable.
- We didn’t focus on it in the earlier options because this post’s primary job is: “how do we preserve the balance invariants under concurrency?”
- We’ll lean on ledger concepts explicitly in the single-writer approach, where the ledger becomes the primary correctness promise.

#### Paragraph 4 — The naive baseline (lost update)
- Baseline “naive” implementation shape (read → decide → write, with no coordination):
  - Read `available_credits`.
  - Decide charged vs owed.
  - Write the updated `available_credits`/`due_credits`.
- Simplified naive code shape (mirrors the real endpoint flow, but intentionally removes tx + locks):

  ```ts
  // Naive controller shape (simplified): validate → build card → (optional) validate → charge → persist
  function createCardController(input: CardInput, ctx: Context, cardRepo: CardRepository, companyRepo: CompanyRepository) {
    const result = await validateInputAddress(input);
  
    const card = Card.new({
      input,
      companyId: campaign.companyId,
      //... more data
    });
  
    const error = await validateCardAddressWithGoogle(card);
    if (error) {
      log.info("Could not validate address", { err: toErrorObject(error) });
    }
  
    const company = await companyRepo.find(campaign.companyId);
    if (!company) throw new Error("Company not found");
  
    chargeCredits(company, card);
  
    await ctx.db.transaction(tx => {
      await cardRepo.saveCard(card);
      await companyRepo.saveWithCredits(company);
    });
  }
  ```

  ```ts
  // Naive repo shape: find + save (no locking contract)
  class CompanyRepo {
    async find(id: string) {
      const result = await this.db.query.companies.findFirst({
        where: eq(companies.id, id),
      });
      if (!result) return null;
      return parseCompany(result);
    }
  
    async saveWithCredits(company: Company) {
      await this.db
        .update(companies)
        .values({
          name: primitives.name,
          // ... other fields
          availableCredits: primitives.availableCredits.toString(),
          dueCredits: primitives.dueCredits.toString(),
        });
    }
  }
  ```

  ```ts
  // Yardstick credits mutation for this post: modify the company + card in-place
  function chargeCredits(company: Company, card: Card) {
    const cost = card.getCreditCost();
    const available = company.getAvailableCredits();

    if (available >= cost) {
      company.setAvailableCredits(available - cost);
      card.markAsCharged();
      return;
    }

    company.setDueCredits(company.getDueCredits() + cost);
    card.markAsOwed();
  }
  ```
- How it fails without coordination (use Example A numbers so the drift is undeniable):
  - Start: `available_credits = 100`.
  - Request A and Request B both read 100 at the same time.
  - Both compute “after = 93”.
  - Both write 93.
  - End state says we charged only 7 credits, but we created 2 charged cards (we should have charged 14).
- Key point: nothing crashes; both operations “succeed”; correctness silently drifts.
- Why this matters for the rest of the post: every strategy we compare is just a different way to prevent this shape of failure.

#### Paragraph 5 — Why we need a yardstick
- After Post 1 it’s tempting to say “just add a lock”.
- But multiple strategies can satisfy the invariants and still feel very different in production.
- The hard part isn’t correctness; it’s choosing your pain (and choosing it deliberately).

#### Paragraph 6 — Evaluation rubric (how we’ll judge each option)
- Criterion 1: **Correctness**
  - Does it preserve the invariants in both micro-scenarios?
- Criterion 2: **Burst behavior + latency scaling**
  - What happens to the second request (wait vs abort/retry vs branch vs enqueue)?
  - How does completion time scale for a burst of `N` operations for the same company?
    - Serialized coordination (row locks / queue): tends to scale ~linearly: `T_total ≈ N × T_tx`.
    - Highly-parallel coordination (atomic update style): closer to “flat” until shared bottlenecks (connections/CPU/I/O) saturate.
- Criterion 3: **Operational pain**
  - Retries/timeouts/deadlocks to handle?
  - Debuggability/observability when things slow down.
- Criterion 4: **Team-discipline / bypass risk**
  - How easy is it for one endpoint to skip the rule and reintroduce drift?
  - How enforceable is this as a codebase-wide contract?

#### Paragraph 7 — Scope guardrail (applied)
- In scope: automated campaign card create/delete (+ owed/due only as needed for correctness).
- Out of scope: purchases/compensations/Stripe, activation flows, single-card/manual flows, general “ledger design”.
- Why: keep one clean yardstick so tradeoffs stay visible.

#### Paragraph 8 — Transition
- “Now we’ll run the exact same scenarios through each strategy, using the same rubric.”
- “Option 1: row-level locks (`SELECT … FOR UPDATE`) — lock the company row and make the second request wait.”
- “Watch what happens to the second request.”

## Section 2 — Option 1: Row-level locks (`SELECT … FOR UPDATE`)
- Narrative goal: show “one enters, one waits” behavior and why it’s predictable and easy to audit.
- Type of reasoning: comparative evaluation.
- Type of code involved: simplified SQL (`FOR UPDATE`) + transaction pseudocode.
- Possible visual: two-lane timeline where Tx B waits.

### Phase 1 — Paragraph skeleton (1 line each)
1) What we thought (X): lock the company row so only one credit mutation runs at a time.
2) Mechanism: inside a transaction, lock first (`findForUpdate` / `FOR UPDATE`), then charge, then persist.
3) Concurrency dance (combined examples): A locks; B waits; charged vs owed outcomes become deterministic.
4) Seeing it in Postgres (small checklist): confirm blocking/waiting via `psql` (`pg_stat_activity`, `pg_locks`, blocking PIDs).
5) Why it works (tie to invariants): row lock forces a serial order → no lost update.
6) Pros (why this is a great default).
7) Cons (latency scales ~linearly per company; hotspots; contention).
8) When I’d pick it / avoid it (decision boundary).
9) Transition to Option 2 (advisory locks).

### Phase 2 — Paragraph details (what to say; bullets only)

#### Paragraph 1 — What we thought (X)
- Start from the yardstick: we have a shared counter (`available_credits`) that can’t drift.
- Simplest idea: when two requests collide, force an order instead of letting both proceed.
- Shared resource: the company’s credits across automated card operations.
- Use the `company` row as the gate: first request locks it and runs; second request waits.
- Plain-language benefit: no lost update because concurrent writes to the same row can’t interleave.
- Keep this anchor sentence: “Row locks turn concurrency into a queue—by company.”

#### Paragraph 2 — Mechanism (transaction + row lock + charge + persist)
- Shape: run “lock + decide + write” inside a single transaction, so the lock is held until commit.
- Critical ordering: **lock first**, then compute charged vs owed, then persist changes.
- This is the minimal contract: every endpoint that mutates credits must follow this shape.

```ts
async function saveCardAndChargeCredits() {
  // ... validate input address, build `card`, load `campaign`, etc. (omitted for brevity)

  await ctx.db.transaction(async (tx) => {
    companyRepo.setDb(tx);
    cardRepo.setDb(tx);

    const lockedCompany = await companyRepo.findForUpdate(campaign!.companyId);
    if (!lockedCompany) throw new Error("Company not found");

    // ... (campaign locking/saving omitted for brevity)

    lockedCompany.chargeCard(card, campaign);

    await cardRepo.saveCard(card);
    await companyRepo.saveWithCredits(lockedCompany);
  });
}
```

```ts
async findForUpdate(id: string) {
  const rows = await this.db.execute(sql`
    SELECT id
    FROM "company"
    WHERE id = ${id}
    FOR UPDATE
  `);
  if (!rows.length) return null;

  const result = await this.db.query.companies.findFirst({
    where: eq(companies.id, id),
  });

  if (!result) return null;
  return parseCompany(result);
}
```

- What to say immediately after the blocks:
  - The `FOR UPDATE` is what makes the second request wait.
  - The lock is held for the lifetime of the surrounding transaction (until commit/rollback).
  - Key constraint: this only works if the lock acquisition happens inside the same transaction that performs the charge + writes.
  - Practical detail: the repository must run its queries on the transaction connection (`tx`), otherwise the lock is acquired and released outside the critical section.
  - What we’re serializing: all mutations of credits for the same `companyId` (the `company` row is the gate).
  - Lock scope: other transactions that try to lock/update the same row will block; plain reads can still run, but may see old/new state depending on timing.

#### Paragraph 3 — Concurrency dance (combined examples)
- What this paragraph is about:
  - Make the behavior of row locks tangible: Request A gets the `company` lock, Request B waits, then proceeds with fresh state.
  - Same mechanism, two outcomes depending on credits (charged/charged vs charged/owed).

- Dance setup (shared):
  - Two requests arrive “at the same time”: A and B.
  - Both target the same `companyId`.
  - `cardCost = 7`.
  - Both execute: `BEGIN → SELECT company FOR UPDATE → charge → persist → COMMIT`.

- Example A (enough credits): `available_credits = 100`, `due_credits = 0`
  1) A begins tx; locks company row (`FOR UPDATE` succeeds immediately).
     - State seen by A: `available = 100`, `due = 0`
  2) B begins tx; attempts same lock; blocks (waits) for A’s tx to end.
  3) A charges (yardstick rule):
     - `available: 100 → 93`
     - `cardA: charged`
     - writes + COMMIT (lock released)
  4) B unblocks; locks the row; reads fresh state:
     - State seen by B: `available = 93`, `due = 0`
  5) B charges:
     - `available: 93 → 86`
     - `cardB: charged`
     - writes + COMMIT
  6) End state: `available = 86`, `due = 0`, both cards charged.

- Example B (insufficient credits): `available_credits = 10`, `due_credits = 0`
  1) A begins tx; locks row; reads `available = 10`, `due = 0`.
  2) B begins tx; tries lock; blocks.
  3) A charges:
     - `available: 10 → 3`
     - `cardA: charged`
     - COMMIT
  4) B unblocks; locks row; reads fresh state `available = 3`, `due = 0`.
  5) B cannot charge (3 < 7) ⇒ owed path (yardstick rule for this post):
     - leave `available = 3` untouched
     - `due: 0 → 7` (full cost)
     - `cardB: owed`
     - writes + COMMIT
  6) End state: `available = 3`, `due = 7`, one charged + one owed.

- What to highlight after the dance:
  - The lock doesn’t “fix math”; it forces a serial order.
  - The only nondeterminism is who gets the lock first; correctness becomes deterministic.
  - The cost is paid in waiting time: B’s latency includes “time A spends in its transaction”.

#### Paragraph 4 — Seeing it in Postgres (small checklist)
- What this paragraph is about:
  - Make row-lock contention visible, then show how to stop “wait forever” from becoming your accidental failure mode.

- Narrative setup:
  - Three concurrent card-create transactions hit the same `companyId`: PIDs 7001, 7002, 7003.
  - 7001 reaches `SELECT ... FOR UPDATE` first and acquires the lock.
  - 7002 and 7003 reach the same statement and wait.
  - This query shows that waiting relationship.

- Query (blocked → blocking):

  ```sql
  SELECT
    blocked.pid  AS blocked_pid,
    blocked.query AS blocked_query,
    blocking.pid AS blocking_pid,
    blocking.query AS blocking_query
  FROM pg_stat_activity blocked
  JOIN LATERAL unnest(pg_blocking_pids(blocked.pid)) AS blocking_pid(pid) ON true
  JOIN pg_stat_activity blocking ON blocking.pid = blocking_pid.pid
  ORDER BY blocked.pid;
  ```

- Hypothetical output (3 concurrent creates):

  | blocked_pid | blocked_query                                    | blocking_pid | blocking_query |
  |------------|---------------------------------------------------|--------------|----------------|
  | 7002       | SELECT id FROM "company" WHERE id = $1 FOR UPDATE | 7001         | COMMIT         |
  | 7003       | SELECT id FROM "company" WHERE id = $1 FOR UPDATE | 7001         | COMMIT         |

- Timeouts + logging:
  - By default, blocked queries can wait indefinitely.
  - You can cap waiting at two layers:
    - `lock_timeout`: how long to wait to acquire a lock before erroring.
    - `statement_timeout`: max runtime for the whole statement/transaction work (depending how you apply it).
  - For visibility, enable `log_lock_waits` so long waits are logged by Postgres.
  - Once timeouts turn “waiting” into errors, retries become the application-level escape hatch (handled explicitly elsewhere).

#### Paragraph 5 — Why it works (tie to invariants)
- What this paragraph is about:
  - Row locks only work as a system if every credits-moving action follows the same locking contract — including actions that “give credits back”.

- What to say:
  - Principle: row locks serialize credit mutations by company, but only for code paths that actually take the lock.
  - Make it imaginable with a concrete collision:
    - An automated campaign sends a card-create request through the API.
    - At the same moment, a user is in the web app deleting a few cards they just created (and those cards haven’t been worked/processed yet).
    - One operation is trying to subtract credits; the other is trying to restore them.
  - Risk: if the delete flow doesn’t lock the company row, it can read stale credits and write back a value that overwrites the create flow’s update (same lost-update shape, but with “+credits” instead of “-credits”).
  - Tie back to the earlier bug class: two “successful” operations, one shared counter, no coordination.
  - Takeaway: row locks aren’t a patch on one endpoint — they’re the credits mutation contract: lock first, then decide, then write, everywhere credits move.

#### Paragraph 6 — Pros
- What this paragraph is about:
  - Why row-level locks are a strong default for “credits per company”: predictable behavior, simple reasoning, and easy auditing.

- Pros:
  - Predictable behavior under contention: the second request waits; no surprise aborts.
  - Easy mental model: “take turns by company” (matches how you think about shared balances).
  - Deterministic correctness: state reflects a serial order; prevents lost update drift.
  - Fits multi-step workflows: works even when the critical section includes multiple reads/writes (not just one SQL statement).
  - Good observability: you can see blocking/waiting directly in Postgres.
  - Good team ergonomics (when centralized): one “lock-first” pattern can be enforced across endpoints.

#### Paragraph 7 — Cons
- What this paragraph is about:
  - Row locks are predictable, but they can melt down under bursts because they turn your critical section into a single-file queue.

- Concrete “queue explosion” example:
  - Assume the locked critical section takes 300ms per request.
  - Requests arrive every 100ms (~10 req/s) for the same `companyId`.
  - Backlog accumulates at (300−100)=200ms of extra queue per request.
  - Request `i` waits roughly `(i−1) * 200ms`, then spends 300ms executing.
    - Example: request 2 waits 200ms, request 3 waits 400ms, request 4 waits 600ms, etc.
  - Request 100:
    - Arrival time: `99 * 100ms = 9.9s`
    - Wait time: `99 * 200ms = 19.8s`
    - Total latency (wait + work): `19.8s + 0.3s = 20.1s`
  - Time until the 100th request finishes: `100 * 300ms = 30s` (because the lock makes them run one-by-one).

- What to say after the example:
  - This is why “waiting” can become an outage: latency grows until clients time out and retries add even more load.
  - Reducing time spent inside the critical section becomes mandatory (reduce the 300ms down to the request arrival time).
  - Timeout tuning is required (`lock_timeout` / `statement_timeout`) so “wait forever” doesn’t happen.
  - Hot-spot risk: one noisy customer/company can serialize themselves into multi-second latency.
  - Potential deadlocks if you later lock more than one thing and don’t enforce a global lock order.

#### Paragraph 8 — When to pick / avoid
- What this paragraph is about:
  - Give the decision boundary: when row locks are the right default, and when they become a bottleneck.

- What to say:
  - Row locks are a good default when:
    - the shared resource is clearly “credits per company” (one row can be the gate),
    - your critical section is small enough that the system can keep up.
  - Practical boundary condition:
    - if the arrival rate for a given company is higher than what one locked critical section can process, you build an ever-growing queue.
    - equivalently: when “per-row throughput demand” exceeds “throughput capacity = 1 / critical-section time”, latency grows without bound.
  - If you hit this boundary, you either:
    - shrink the critical section aggressively, or
    - switch strategies (atomic update / single-writer / etc.), depending on what pain you want.
  - Tie to the rubric: row locks buy predictability and correctness; the price is latency scaling under contention.

- Scaling variant (when row-locking the company becomes the bottleneck): bucket pre-allocation (escrow / sharded counters).
  - Idea:
    - Each bucket (e.g., campaign) holds its own `bucket_available_credits`.
    - Cards lock and decrement the bucket row, not the company row.
    - When the bucket is low, it refills by taking the company lock once and moving (say) +300 credits into the bucket.
  - Why it helps:
    - Company-level locks drop from “one per card” to “one per refill”.
    - If average refill is 300 credits and each card costs ~3 credits, that’s ~100× fewer company locks in steady state.
  - Tradeoffs / footguns:
    - You’re building distribution + reclamation logic (idle bucket recovery, max bucket size, refill policy).
    - Hot bucket = same problem (if 80% of load hits one campaign, you serialize there).
    - Fairness issues: a new campaign can starve while credits sit unused in other buckets unless you implement rebalancing.
    - Operational strategy example: run a daily cron/allocator that adjusts each campaign’s bucket size based on historic throughput (e.g., keep ~7 days of expected spend in-bucket), to reduce refill frequency for hot campaigns and reclaim credits from idle ones.
  - When it’s worth it:
    - Only when per-company contention is sustained and you need throughput without moving to a queue/single-writer yet.

#### Paragraph 9 — Transition
- Transition sentence (what it sets up):
  - “Row locks solve correctness by making everyone wait their turn — but sometimes your ‘shared resource’ isn’t naturally one row, or you want a mutex that spans multiple tables.”
- Tease Option 2 at a high level (no deep details yet):
  - advisory locks are the same “wait” failure mode, but enforced by a logical mutex key instead of a row lock.
- Optional one-liner to keep the comparison frame:
  - “Same physics, different surface area — and different footguns.”

## Section 3 — Option 2: Advisory locks (`pg_advisory_xact_lock`)
- Narrative goal: show “mutex by key” behavior and the tradeoff: lighter mechanism, higher discipline risk.
- Type of reasoning: comparative evaluation.
- Type of code involved: example SQL call + transaction pseudocode.
- Possible visual: the same timeline, but with a “logical mutex” instead of row lock.

### Phase 1 — Paragraph skeleton (1 line each)
1) Define advisory locks: a Postgres logical mutex you take “by key” (e.g., `companyId`), not by locking a specific row.
2) Reframe: they’re still serialization; they don’t remove queue/latency physics.
3) Mechanism: inside the transaction, acquire `pg_advisory_xact_lock(companyKey)` first, then run the same “read → charge → persist” flow (show simplified code).
4) Pros: flexible; works even when the contended resource isn’t naturally a single row.
5) Cons: bypass/discipline risk; easier to forget; observability less intuitive than `FOR UPDATE`.
6) When to pick: when you need “mutex by key” across a wider surface than one row; otherwise row locks are the safer default.
7) Transition: serializable isolation changes the failure mode from “wait” to “abort + retry”.

### Phase 2 — Paragraph details (what to say; bullets only)

#### Paragraph 1 — Define advisory locks
- Advisory locks are a Postgres feature that lets you take a logical mutex on an arbitrary key (not a table row).
- You choose the key (e.g., `companyId`), so you can say: “only one credits mutation per company runs at once.”
- `pg_advisory_xact_lock(...)` is transaction-scoped:
  - acquired inside the transaction
  - automatically released on commit/rollback
- It’s not enforced by the data; it’s enforced because every code path agrees to take the same mutex key before mutating credits.

#### Paragraph 2 — Serialization doesn’t go away
- Advisory locks don’t make work parallel; they just move “take turns” from a row lock to a logical mutex.
- Under contention, other requests still wait on the mutex.
- So the same queue math from row locks applies: critical-section time dominates burst latency.
- This is not a downside; it’s just the chosen failure mode (“wait”) showing up again.

#### Paragraph 3 — Mechanism (advisory lock + same flow)
- The shape is identical to row locks, except the coordination step is `pg_advisory_xact_lock(companyKey)`.
- Put it inside the same transaction so the lock lifetime matches the critical section.
- Then perform the same business mutation + writes.

```ts
async function saveCardAndChargeCredits() {
  // ... validate input address, build `card`, load `campaign`, etc. (omitted)

  await ctx.db.transaction(async (tx) => {
    companyRepo.setDb(tx);
    cardRepo.setDb(tx);

    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(hashtext(${campaign!.companyId}))
    `);

    const company = await companyRepo.find(campaign!.companyId);
    if (!company) throw new Error("Company not found");

    company.chargeCard(card, campaign);

    await cardRepo.saveCard(card);
    await companyRepo.saveWithCredits(company);
  });
}
```

#### Paragraph 4 — Pros
- Flexible: you can lock on a derived key (e.g., `companyId`) even if the workflow touches multiple tables/rows.
- Lightweight coordination primitive (conceptually simple): one mutex call at the top of the transaction.
- Useful when the contended resource is “logical” (e.g., “credits for company X”) rather than “row Y”.

#### Paragraph 5 — Cons
- Discipline/bypass risk: any code path that forgets the advisory lock can mutate credits concurrently and reintroduce drift.
- Less intuitive observability than `FOR UPDATE` (still inspectable, but not as “obviously tied” to a row).
- Same waiting/timeout/retry considerations as row locks (because it’s still “wait” failure mode).

#### Paragraph 6 — When to pick (vs row locks)
- Pick advisory locks when:
  - you need a mutex by logical key and there isn’t a single “gate row” you can reliably lock first.
- Prefer row locks when:
  - there is a clear gate row (like `company` credits), because the enforcement is naturally tied to the data.

#### Paragraph 7 — Transition
- Row locks and advisory locks share the same failure mode: waiting.
- Next, we’ll look at a different approach: make the credits rule enforceable with a single atomic `UPDATE` statement — less waiting, different tradeoffs.

## Section 4 — Option 3: Atomic updates (`UPDATE … WHERE available >= cost`)
- Narrative goal: explain how a single statement can enforce “no negative” and where it stops being enough (multi-entity consistency).
- Type of reasoning: comparative evaluation.
- Type of code involved: single SQL `UPDATE ... RETURNING` + follow-up transaction notes.
- Possible visual: “one statement” callout + branching outcomes (charged vs owed).

### Phase 1 — Paragraph skeleton (1 line each)
1) Define atomic updates: update the balance relative to itself (`available = available - cost`) to avoid read-modify-write in app code.
2) The catch: single-row atomic updates are easy; real flows need branching (charged vs owed) and often more writes.
3) Reservation pattern: do an atomic “reservation” in SQL that returns charged vs owed + before/after values.
4) Endpoint shape: transaction → reserve → set card status → persist card (and any other writes later).
5) Why it can be faster than `FOR UPDATE`: fewer roundtrips + less work while holding the row lock + update only needed columns.
6) Main downside: it pushes domain decision logic toward the application layer/controller.
7) When to pick: great when the invariant can be encoded in SQL cleanly and you value latency; risky when you need multi-entity consistency unless you’re disciplined with transactions.
8) Transition: if you want Postgres to abort conflicts instead of waiting, that’s serializable.

### Phase 2 — Paragraph details (what to say; bullets only)

#### Paragraph 1 — Define atomic updates
- The naive pattern is: read `available_credits`, compute a new number in the app, write it back.
- Under concurrency, that pattern is exactly what produces lost updates.
- Atomic updates flip it: instead of “set balance to X”, you say “set balance to balance minus cost”:
  - `available_credits = available_credits - cost`
- When the operation is truly “touch one row”, this is often the simplest and fastest correct approach.

#### Paragraph 2 — The catch (real flows branch)
- This section’s running example is still just an example — the same pattern applies to many “money-like counter” systems.
- If all you need is “decrement a counter”, `available = available - cost` is perfect.
- But many real flows aren’t just one field:
  - you must branch (`charged` vs `owed`)
  - you must update the right fields in each branch (e.g., `due_credits` when owed)
  - you must keep the “decision” consistent with side effects (e.g., the card status)
- So we need a pattern that stays atomic and returns the decision outcome: reservation.

#### Paragraph 3 — Reservation pattern (atomic + returns the decision)
- Instead of “read credits → decide → write”, we ask the DB to do it in one atomic step.
- The reservation tries to charge from `available_credits` when possible; otherwise it increases `due_credits`.
- The important part is the return value: it tells the application which branch to take (`charged` vs `owed`) deterministically.

```sql
WITH before AS (
  SELECT
    id,
    available_credits,
    due_credits
  FROM company
  WHERE id = :company_id
),
updated AS (
  UPDATE company c
  SET
    available_credits = CASE
      WHEN before.available_credits >= :cost THEN before.available_credits - :cost
      ELSE before.available_credits
    END,
    due_credits = CASE
      WHEN before.available_credits >= :cost THEN before.due_credits
      ELSE before.due_credits + :cost
    END
  FROM before
  WHERE c.id = before.id
  RETURNING
    c.available_credits AS after_available_credits,
    c.due_credits       AS after_due_credits
)
SELECT
  before.available_credits AS before_available_credits,
  before.due_credits       AS before_due_credits,
  updated.after_available_credits,
  updated.after_due_credits,
  (before.available_credits >= :cost) AS charged
FROM before
JOIN updated ON true;
```

- Further reading (reference):

  ```text
  https://blog.pjam.me/posts/atomic-operations-in-sql
  ```

#### Paragraph 4 — Endpoint shape (transaction → reserve → persist)
- Flow: transaction → reserve credits atomically → set card status based on `charged` flag → persist the card.
- Key point: once the reservation returns, the application no longer has to “guess” whether the card is charged or owed.

```ts
await ctx.db.transaction(async (tx) => {
  const reservation = await companyRepo.reserveCreditsForNewCardAtomic(
    campaign.companyId,
    cardCost,
  );
  
  beforeCredits = reservation.beforeAvailableCredits;
  companyRef.setAvailableCredits(reservation.afterAvailableCredits);
  companyRef.setDueCredits(reservation.afterDueCredits);
  
  if (reservation.charged) {
    card.markAsCharged();
  } else {
    card.markAsOwed();
  }
  
  await cardRepo.saveCard(card);
})
```

#### Paragraph 5 — Why it can be faster (even though it still waits)
- This approach still locks the row (the `UPDATE` acquires a row lock), so the failure mode is still “wait”.
- The speedup comes from reducing work in the critical section:
  - fewer DB round trips (no separate “lock select” + “update” pattern)
  - update only the columns you need, not the whole row
  - compute the decision in SQL and return it
- Evidence (k6, same scenario settings):
  - `FOR UPDATE` version: `create_card_duration avg=5.44s`, `p95=38.83s`
  - atomic reservation version: `create_card_duration avg≈532ms`, `p95≈923ms`
- Interpretation: this isn’t magic parallelism; it’s a smaller critical section.

#### Paragraph 6 — Main downside (domain logic leaks upward)
- With `FOR UPDATE`, the controller can keep orchestration simple and let `chargeCard(...)` encapsulate most logic.
- With reservation, you’re now:
  - encoding branching logic in SQL,
  - then applying the outcome in the controller (`if charged → mark charged else owed`),
  - which spreads the domain rule across layers.
- This is acceptable for performance, but it has a cost: more places to keep consistent as the domain evolves.

#### Paragraph 7 — When to pick (atomic reservation)
- Pick atomic updates/reservation when:
  - the invariant can be encoded cleanly in SQL,
  - you need lower latency under contention,
  - and you can keep all related side effects in the same transaction.
- Be careful / avoid when:
  - the operation spans many entities and the “one statement decides everything” becomes hard to maintain,
  - or you risk duplicating business rules across SQL + app code.

#### Paragraph 8 — Transition
- Atomic reservation still relies on waiting/locking behavior on hot rows.
- If you’d rather let concurrency happen and have the database abort one transaction when the interleaving can’t be made safe, that’s serializable isolation.
- Next: serializable = “abort + retry” failure mode.

## Section 5 — Option 4: Serializable isolation (`SERIALIZABLE`)
- Narrative goal: explain “Postgres aborts one transaction” and what that implies operationally (retries under bursts).
- Type of reasoning: comparative evaluation.
- Type of code involved: `BEGIN ISOLATION LEVEL SERIALIZABLE` + retry loop pseudocode.
- Possible visual: timeline where Tx B aborts and retries.

### Phase 1 — Paragraph skeleton (1 line each)
1) 2-sentence model: `SERIALIZABLE` enforces “as-if one-at-a-time”; when it can’t, Postgres aborts one tx with `40001` (failure mode = abort + retry).
2) Example/dance (100 credits): two concurrent creates both “decide charged”; one commits, the other aborts `40001`; on retry it re-reads and succeeds.
3) Same naive code + `SERIALIZABLE` + retry wrapper: keep the flow, but run the tx in serializable and retry on `40001`.
4) Pros: strong correctness without designing explicit locks; useful for read/predicate conflicts.
5) Cons: aborts/retries under bursts; retry storms; variable latency; unsafe side-effects if not idempotent.
6) When to use: conflicts are rare + retries are correct + side-effects are outside; avoid when contention is high per company.
7) Transition to queue: if you want to turn contention into a single-writer pipeline, use a queue.

### Phase 2 — Paragraph details (what to say; bullets only)

#### Paragraph 1 — 2-sentence model
- Postgres `SERIALIZABLE` gives you the illusion that concurrent transactions ran one-at-a-time. When it can’t, it aborts one with SQLSTATE `40001`.
- So the failure mode isn’t “wait” — it’s “abort + retry”.

#### Paragraph 2 — Example/dance (100 credits, then a note for 10 credits)
- Example (100 credits): show two concurrent creates:
  - both read `available_credits = 100` and both decide “charged”
  - one commits
  - the other fails with `40001` (serialization failure)
  - on retry, it re-reads `available_credits = 93` and commits successfully
- Short note (10 credits): same mechanics, but on retry the second request may flip outcome to owed depending on the new balance.

#### Paragraph 3 — Same flow + `SERIALIZABLE` + retries
- Keep the same “read → decide → write” flow; the difference is the isolation level and the retry policy.
- Run the critical section in a serializable transaction; under contention, some commits will fail with `40001`.
- So the retry wrapper isn’t optional — it’s part of the contract, and it must wrap the whole transaction.

```ts
await withLockRetry(async (attempt) => {
  await ctx.db.transaction(async (tx) => {
    // Must be the first statement in the transaction
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);

    // Naive flow (simplified): read → decide → write
    const company = await companyRepo.find(companyId);
    if (!company) throw new Error("Company not found");

    chargeCredits(company, card); // same yardstick-style mutation as before

    await cardRepo.saveCard(card);
    await companyRepo.saveWithCredits(company);
  });
});
```

```ts
function isSerializationFailure(err: unknown): boolean {
  const anyErr = err as { code?: string; message?: string } | null;
  return (
    anyErr?.code === "40001" ||
    (anyErr?.message?.toLowerCase().includes("could not serialize") ?? false)
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withLockRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts?: { maxAttempts?: number; baseDelayMs?: number },
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? 3;
  const baseDelayMs = opts?.baseDelayMs ?? 50;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (!isSerializationFailure(err) || attempt >= maxAttempts) throw err;

      const jitter = Math.floor(Math.random() * baseDelayMs);
      await sleep(baseDelayMs * attempt + jitter);
    }
  }

  throw new Error("unreachable");
}
```

- What to say right after:
  - Under contention, `SERIALIZABLE` will throw `40001`; retries are expected.
  - The retry must wrap the whole transaction (not just the last statement).
  - Keep external side-effects out of the retried block (or make them idempotent), otherwise retries duplicate them.

#### Paragraph 4 — Pros
- Strong correctness without designing explicit locks everywhere.
- Useful when conflicts aren’t neatly “one row to lock first” (read/predicate-style anomalies).
- Lets you keep more of the naive app flow, as long as retries are correct.

#### Paragraph 5 — Cons
- Under bursts on the same `companyId`, you can get many `40001` aborts → retry storms.
- Latency becomes variable (attempt → abort → retry), not the “clean queue” you get with locks.
- Operationally harder to explain/debug than “B waited on A”.
- Dangerous if you perform non-idempotent side effects inside the retried block.

#### Paragraph 6 — When to use
- Use `SERIALIZABLE` when:
  - conflicts are relatively rare,
  - you can implement retries correctly (and cap them),
  - and you can keep side effects out of the transaction.
- Avoid when:
  - you expect sustained contention on the same company row (high concurrency per company),
  - or your team can’t reliably implement idempotency/retry discipline.

#### Paragraph 7 — Transition
- Locks and advisory locks: failure mode = wait.
- Serializable: failure mode = abort + retry.
- If you want to avoid both “long waits” *and* “retry storms”, you have two broad moves:
  - amortize coordination (chunk leasing/token bucket), or
  - move coordination out of the DB entirely (queue/single-writer).
- Next up: chunk leasing/token bucket — how to take per-request work out of Postgres (and what complexity you buy).

## Section 6 — Option 5: Chunk leasing / Token bucket (Redis or in-memory)
- Narrative goal: show a separate class of approach: reserve big prepaid chunks in the DB, spend locally at high throughput, and refill occasionally.
- Type of reasoning: comparative evaluation.
- Type of code involved: one atomic SQL “take bucket” + Redis `DECRBY`/Lua pseudocode + lease/reconciliation notes.
- Possible visual: bucket + refill diagram (DB → bucket → requests).

### Phase 1 — Paragraph skeleton (1 line each)
1) Define the approach: reserve big prepaid chunks from the DB, spend locally (Redis/in-memory), refill when empty.
2) DB primitive (prepaid correctness): atomic “take bucket” (`UPDATE ... WHERE balance >= bucketSize RETURNING ...`).
3) Per-request spend: `DECRBY` (or Lua) on the bucket; what happens at 0.
4) Failure modes: process crash / Redis failover / duplicates — why you need leases.
5) Ledger / durable log (required): without a durable log (or reservation log + lease + reclaim), crashes become money bugs; recovery requires reconciliation.
6) Pros: massive DB write reduction + stable latency under bursts.
7) Cons: reconciliation complexity + approximate real-time balance unless you model reserved/spent explicitly.
8) When to pick: only when per-company throughput demands justify the complexity.
9) Further reading: token bucket concept + Redis implementation + Stripe usage-based billing.

### Phase 2 — Paragraph details (what to say; bullets only)

#### Paragraph 1 — Define the approach
- Motivation: per-request DB coordination (locks / retries) can become the bottleneck under bursts.
- Core move: amortize DB contention by reserving a large chunk of credits from the real balance (in Postgres).
- Then: spend from that chunk locally (Redis or in-memory) per request:
  - per-request operation becomes a fast atomic decrement (e.g., `DECRBY`).
- When the chunk is empty (or low), go back to Postgres and reserve the next chunk.
- Failure mode shift:
  - the DB is no longer hit per request
  - it’s hit per refill
- Tie to rubric: trades DB simplicity for systems complexity (leases + reconciliation), covered in later paragraphs.

#### Paragraph 2 — DB primitive (“take bucket”)
- The chunk must come from somewhere real: the Postgres balance.
- So refills use a single atomic statement: “take bucket if balance >= bucketSize”.
- If it affects 1 row: chunk granted. If 0 rows: insufficient credits (reject or switch to an owed/debt path, depending on product rules).

```sql
-- TakeBucket(accountId, bucketSize)
UPDATE accounts
SET balance = balance - :bucket_size
WHERE account_id = :account_id AND balance >= :bucket_size
RETURNING balance;
```

#### Paragraph 3 — Per-request spend (Redis token bucket)
- Once a chunk is granted, per-request spend should not touch Postgres.
- Use Redis as the shared state across instances.
- Per request you want an atomic operation that:
  - checks remaining
  - decrements
  - returns the new remaining (or a failure)
- If the bucket is insufficient, you either refill and retry, or fall back to owed/reject depending on product rules.

```lua
-- KEYS[1] = bucket key (e.g. "credits:company:<id>:bucket")
-- ARGV[1] = cost (integer, e.g. 3)
local remaining = tonumber(redis.call("GET", KEYS[1]) or "0")
local cost = tonumber(ARGV[1])

if remaining >= cost then
  remaining = remaining - cost
  redis.call("SET", KEYS[1], remaining)
  return {1, remaining} -- charged, new remaining
else
  return {0, remaining} -- insufficient in bucket
end
```

#### Paragraph 4 — Failure modes (why you need leases)
- Classic failure: you reserve a 50k-credit chunk, then the process dies with 37k still unused.
- Without a recovery mechanism, those credits are stranded (“lost”) or can be double-spent during recovery.
- So chunks need a lease/TTL:
  - renew while active
  - reclaim unused credits when the lease expires
- Redis TTL can help with liveness, but reclaim/refund must be anchored in the DB (or a durable log).

#### Paragraph 5 — Ledger / durable log (required)
- Once spending happens in memory/Redis, crashes become money bugs unless you can reconstruct what was consumed.
- You need either:
  - a full ledger of usage events, or
  - a reservation log with `reserved_amount`, `consumed_amount`, a lease, and a reclaim/refund process.
- Recovery story:
  - on restart/cron, reconcile: refund unused reserved credits, or replay usage into the reservation, or recompute available by aggregating durable events.
- Key framing: this approach trades “DB contention” for “distributed accounting”.

#### Paragraph 6 — Pros
- DB writes drop from O(requests) to O(refills).
- Much more stable per-request latency under bursts.
- Contention is concentrated on refill operations, not every spend.

#### Paragraph 7 — Cons
- Reconciliation complexity (leases, reclaim, refund of unused credits).
- More operational risk (Redis availability/failover semantics affect billing correctness).
- Real-time “available credits” becomes approximate unless you model reserved/spent explicitly in the DB.
- Much higher implementation surface area than in-DB locking/reservation.

#### Paragraph 8 — When to pick
- Pick this when per-company throughput is high enough that per-request DB coordination is a bottleneck, and you can afford the reconciliation/ledger complexity.
- Avoid if you can solve the problem with in-DB approaches (row locks / atomic reservation) and want a simpler correctness story.

#### Paragraph 9 — Further reading

```text
https://en.wikipedia.org/wiki/Token_bucket
https://github.com/RussellLuo/ratelimiter
https://stripe.com/blog/how-we-built-it-usage-based-billing
```

## Section 7 — Option 6: Queue / single-writer
- Narrative goal: show what it buys (predictability) and what it costs (latency, complexity, architecture).
- Type of reasoning: comparative evaluation.
- Type of code involved: pseudocode (enqueue → worker consumes).
- Possible visual: queue diagram.

### Phase 1 — Paragraph skeleton (1 line each)
1) Reframe: stop trying to mutate a shared counter in the request path; model “usage” as events.
2) New invariants: “no missing events, no double charge, auditable ledger” (instead of `balance >= 0` per request).
3) Architecture: events → queue/stream partitioned by `companyId` → one consumer owns the partition → single writer applies events in order.
4) Hybrid model: burn down prepaid credits; once exhausted, keep recording usage as overage and bill end-of-month.
5) Optional hard-stop: if you truly need `balance >= 0` synchronously, you must block on the writer (sync-over-async) or do authorize/capture.
6) Reliability: consumer idempotency + outbox pattern if the API both writes business state and emits a usage event.
7) Pros: no hot-row contention in request path; scales with partitions; ledger is the source of truth.
8) Cons: system complexity; delayed/async failure modes; more moving parts (queue, consumers, outbox).
9) When to pick: when you need hybrid billing (prepaid+overage) and auditability at high throughput.

### Phase 2 — Paragraph details (what to say; bullets only)

#### Paragraph 1 — Reframe
- Up to now, every approach fought the same thing: concurrent requests trying to mutate one shared counter.
- Single-writer flips the model: the request path emits a “usage event”, and a single consumer per company applies events in order.
- So we trade “DB contention per request” for “ordered processing per account”.

#### Paragraph 2 — New invariants
- The primary invariant becomes: no missing events, no double charges, and a durable ledger you can audit/replay.
- In a hybrid prepaid + pay-as-you-go model, you may intentionally allow “overage” once prepaid is exhausted.
- That means you can’t promise “balance >= 0” at request time in the same way; you promise “billing is correct when the ledger is processed.”

#### Paragraph 3 — Architecture (single-writer per company)
- API produces usage events (one per chargeable action), keyed by `companyId`.
- Queue/stream partitions by that key so events for the same company are ordered.
- A consumer group processes partitions: one consumer owns a partition, so it becomes the single writer for those companies.
- The consumer:
  - checks idempotency
  - appends to a ledger
  - updates a materialized “balance/credits” view (optional but common)

#### Paragraph 4 — Hybrid prepaid + overage (AI example)
- This hybrid model is common in AI companies and other usage-based products:
  - users buy an included credit/token pack (prepaid)
  - usage burns it down in near-real time
  - once it’s exhausted, usage continues as overage and is billed later (postpaid)
- Concrete AI-flavored example:
  - “Your plan includes 10M tokens/month.”
  - Each request emits a usage event with `input_tokens`, `output_tokens`, and the computed cost.
  - The single writer deducts from prepaid while available; after that, it keeps appending usage as overage for month-end invoicing.
- Tie back to the promise: in this model, “ledger correctness” matters more than a synchronous “balance never goes below zero”.

#### Paragraph 5 — Optional hard-stop UX
- Pure async means the API doesn’t know the final balance decision immediately.
- If you need a hard stop, you need one of:
  - sync-over-async (API waits for the single writer decision with a timeout)
  - authorize/capture (reserve upper bound, then finalize cost later)
- This is why many systems choose hybrid prepaid+overage: it avoids turning UX into a distributed transaction.

#### Paragraph 6 — Reliability (idempotency + outbox)
- Consumer idempotency:
  - every usage event has an idempotency key
  - the consumer stores/applies it once (unique constraint / idempotency table)
- Transactional outbox (when events come from DB writes):
  - if your API both writes business state and emits a usage event, you need atomicity
  - outbox pattern: write an outbox row in the same DB tx, then a publisher streams it to the queue

- Further reading (references used in this section):

  ```text
  https://stripe.com/blog/how-we-built-it-usage-based-billing
  https://www.confluent.io/learn/kafka-partition-key/
  https://www.confluent.io/learn/kafka-message-key/
  https://debezium.io/blog/2019/02/19/reliable-microservices-data-exchange-with-the-outbox-pattern/
  https://docs.withorb.com/quickstart/prepurchase
  ```

#### Paragraph 7 — Pros
- Removes hot-row contention from the request path (no per-request DB lock/retry storm).
- Scales by adding partitions/consumers (throughput comes from the stream, not row-level coordination).
- Ledger-first gives auditability and makes “what happened?” debuggable.

#### Paragraph 8 — Cons
- More infrastructure and operational complexity (queue/stream, consumers, monitoring, backpressure).
- Harder synchronous UX if you truly need strict prepaid gating (`balance >= 0` at request time).
- Async failure modes: you need strong observability to know when processing lags/fails.
- Ledger note: ledger/auditability is orthogonal and can be added to other approaches too — but here you’re also committing to an event pipeline, which is the bigger complexity jump.

#### Paragraph 9 — When to pick
- Pick single-writer when:
  - you need hybrid prepaid + overage billing,
  - you need auditability/ledger as a first-class artifact,
  - and you expect high throughput where request-path DB coordination becomes painful.
- Avoid when:
  - you need strict synchronous gating and can’t tolerate the extra machinery,
  - or your scale doesn’t justify adding a queue/streaming pipeline.

## Section 8 — Decision: what we chose (and how to apply it without footguns)
- Narrative goal: land the decision and make it actionable: what the contract is, how to apply it everywhere, and when you’d pick differently.
- Type of reasoning: decision under constraints.
- Type of code involved: minimal “contract” pseudocode + lock ordering notes + bounded retry policy (high level).
- Possible visual: small decision table (criteria vs chosen option) + “rules of the road” box.

### Phase 1 — Paragraph skeleton (1 line each)
1) Decision summary: we chose atomic reservation as the main concurrency contract for automated card create/delete credits.
2) What we tried first: row-level locks (`FOR UPDATE`) worked for correctness but was too slow under bursts (queueing latency).
3) Why atomic reservation wins for us: same “wait” failure mode, but much smaller critical section and lower tail latency (k6 evidence).
4) How we apply it safely: reservation result drives `charged/owed` deterministically; keep everything in one transaction.
5) Fallback plan: if per-company throughput grows enough that even atomic reservation queues too much, we’d move to Redis chunk leasing/token bucket (with reconciliation/ledger complexity).
6) Boundaries: when we would not choose this, and what we’d pick instead.

### Phase 2 — Paragraph details (what to say; bullets only)

#### Paragraph 1 — Decision summary
- For Manuscritten automated campaign card create/delete credits, we chose atomic reservation (single-statement update) as the primary concurrency contract.
- Goal: preserve correctness under bursts without turning the request path into a long queue.
- This keeps the decision (`charged` vs `owed`) deterministic and fast.

#### Paragraph 2 — What we tried first (row locks were correct but too slow)
- First attempt: row-level locks (`SELECT ... FOR UPDATE`) with the “lock-first → decide → write” contract.
- It fixed correctness, and it was easy to reason about.
- But under bursty automated traffic, the “wait” failure mode turned into painful tail latency (requests queueing behind the critical section).
- We saw it directly in k6: the create-card path could degrade to multi-second / tens-of-seconds p95 under load.

#### Paragraph 3 — Why atomic reservation won for us (same failure mode, smaller critical section)
- Atomic reservation doesn’t eliminate waiting: the `UPDATE` still locks the row.
- The win is that we shrink the critical section:
  - fewer DB round trips
  - less time holding the lock
  - less work per request inside the serialized region
- Evidence (k6, same scenario settings):
  - `FOR UPDATE` version: `create_card_duration avg=5.44s`, `p95=38.83s`
  - atomic reservation version: `create_card_duration avg≈532ms`, `p95≈923ms`
- Interpretation: we chose the same failure mode (“wait”), but made it cheap enough that it stays acceptable.

#### Paragraph 4 — How we apply it safely (contract)
- The contract we enforce in every credits-mutation path:
  - perform the reservation atomically in the DB
  - use the returned `charged` flag (and before/after credits) to drive the branch deterministically
  - persist the card (and any related state) in the same transaction
- Key footgun to avoid: splitting “reservation” and “side effects” across different transactions/connections.
- Practical rule-of-thumb: the reservation function becomes the single source of truth for “charged vs owed”.

#### Paragraph 5 — Fallback plan (if throughput per company grows)
- If we ever reach a point where per-company arrival rate exceeds what a single row update can sustain (queueing returns, tail latency grows), we’ll move to a chunk leasing/token bucket approach with Redis.
- That shifts the bottleneck from “per-request DB contention” to “refill + reconciliation”, and it can scale much further.
- We accept the tradeoff: more moving parts (leases/TTL + durable log/ledger) in exchange for removing DB work from the request path.

#### Paragraph 6 — Boundaries (when we’d choose differently)
- If strict synchronous “balance >= 0” gating is mandatory and burst latency cannot exceed a tight SLA:
  - consider single-writer/queue (or authorize/capture style flows).
- If concurrency is low and simplicity matters more than tail latency:
  - row-level locks remain a great default.
- If conflicts are rare but correctness must be strong across complex reads:
  - `SERIALIZABLE` can work, but only with disciplined retries and side-effect handling.

## Conclusion
- Narrative goal: close the decision loop: a reusable framework + a default recommendation + a clear “it depends” boundary.
- CTA direction: ask readers to comment with their worst acceptable failure mode.
### Phase 1 — Paragraph skeleton (1 line each)
1) Close the loop: “choosing a concurrency strategy = choosing a failure mode”, plus the Postgres-only reminder.
2) The cheat sheet: a compact “if X, pick Y” summary mapped to the 6 options.
3) What we chose in Manuscritten: atomic reservation (and why), with the performance contrast as proof.
4) Safety contract: “every credits mutation must follow the same contract” + add a note that ledgers are compatible with every approach.
5) CTA: ask readers to name the failure mode they can tolerate (and what constraints force it).

### Phase 2 — Paragraph details (what to say; bullets only)

#### Paragraph 1 — Close the loop
- Restate the core frame in one sentence:
  - you’re not choosing a lock; you’re choosing what happens under contention.
- Re-mention the three failure modes the reader should keep in their head:
  - wait (queueing), abort+retry (retry storms), bypass (discipline bugs).
- Postgres-only reminder (short):
  - the primitives and observability in this post assume Postgres.

#### Paragraph 2 — Cheat sheet (decision summary)
- Summarize the decision as a quick mapping:
  - If correctness + simplicity matter and per-company concurrency is low → row locks.
  - If the “thing to serialize” spans multiple rows/tables → advisory locks (with discipline).
  - If your invariant can be encoded as one statement → atomic reservation (default recommendation).
  - If conflicts are rare but reads are complex → serializable + retries (with strict idempotency).
  - If per-company throughput is high and DB is the bottleneck → chunk leasing/token bucket (Redis) + reconciliation/ledger.
  - If you want an explicit pipeline and ordered processing per account → queue/single-writer + ledger.
- One sentence tying it back to the rubric:
  - each choice trades correctness surface area, latency under burst, and operational complexity.

#### Paragraph 3 — Manuscritten choice (atomic reservation)
- Repeat the “why” crisply:
  - row locks were correct but too slow under the k6 scenario; atomic reservation kept correctness while cutting the critical section.
- Include the k6 numbers (already in Section 8; reference them again briefly):
  - `FOR UPDATE avg=5.44s p95=38.83s` vs atomic reservation `avg≈532ms p95≈923ms`.
- Mention the “fallback” in one line:
  - if we outgrow this, we move to chunk leasing/token bucket.

#### Paragraph 4 — Safety contract (what makes it actually correct in production)
- Re-emphasize the “every endpoint must do it” point:
  - creates and deletes and any future feature that touches credits must use the same contract.
- State the contract in one compact checklist:
  - reserve/charge via one atomic function (or one gating mechanism),
  - decide charged/owed from the returned result deterministically,
  - persist card + credit effects in the same transaction.
- Ledger note (tie back to Section 1.5):
  - a durable ledger is compatible with every approach; we just focused here on “how to keep the invariant under concurrency.”

#### Paragraph 5 — CTA
- Ask a concrete question that forces constraint reasoning:
  - “What failure mode is worst for you: waiting, retries/aborts, or accidental bypass—and what constraint forces that preference?”

## What This Article Does NOT Cover
- Purchases/compensation and Stripe flows.
- One-time campaign activation and single-card flows.
- Implementing a full queue architecture (discussed conceptually only).
