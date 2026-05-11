# How do you choose a concurrency strategy for a credits system (without becoming a database expert)?

In Post 1 we showed the nightmare scenario: two perfectly “successful” operations happening at the same time can make your pay‑per‑use balance wrong without throwing a single error. Then we built a test that reproduces that failure on demand, so it stops being a production ghost. But we didn't propose any solution to the problem. In this post, we’ll compare the main coordination approaches you can use in Postgres and give you a simple way to choose one based on the failure mode you can tolerate.

We’ll start with the simplest fixes inside Postgres (make requests wait with a lock, make the update atomic, or let Postgres abort/retry conflicts). Then we’ll look at “bigger guns” when one company becomes a hotspot: spending from a fast shared counter like Redis, or going all the way to a single-writer/queue so each company’s credits are processed in order.

Note: This post is Postgres-specific, because locking and isolation details (and even the best “who’s blocking who” queries) differ across databases.

But before we compare anything, let me set one small example we’ll reuse for every option so you can feel the difference in behavior, not just read theory.

## The yardstick

In the previous post, I explained how I ran into these problems at my startup, Manuscritten. I’ll use it as the running example for this article, since it’s what I know best. The ideas described here apply to any prepaid-credit system that tries to maintain an updated balance.

Manuscritten helps companies send personalized handwritten letters and postcards to their customers as a marketing channel. For example: when an ecommerce company wants to thank a VIP customer after their 10th purchase, instead of sending a boring email, they send a premium-looking handwritten letter that feels like it was written by a human.

We call each item that gets sent a “card”. Each card has a cost in our credits system depending on the recipient address and design.

When a company (the ecommerce company in the previous example) wants to send cards, it first has to pre-purchase credits, which are added to the `availableCredits` balance. From that point forward, every new card will try to spend credits from that balance. For example: if a company has 100 `availableCredits` and a new card costs 7 credits, the resulting balance is 93.

At some point, the company might run out of credits. In that case, new incoming cards get marked as owed and, instead of decreasing `availableCredits` below zero, we increase another balance: `dueCredits`. For example: if the company has 3 `availableCredits` and a card that costs 7 credits arrives, instead of setting `availableCredits` to -4 we keep `availableCredits` at 3 and increase `dueCredits` by 7.

So the resulting domain looks like this:

```ts
export enum PaymentStatus {
  CHARGED = "charged",
  OWED = "owed",
}

export default class Card {
  private paymentStatus: PaymentStatus;
  private price: number;
  private name: string;
  private surname: string;
  private address: string;
  private zipCode: string;
  // ... more fields
}
```


```ts
export class Company {
  // ... more fields
  private availableCredits: number;
  private dueCredits: number;
}
```

In this domain, there are three invariants that have to be maintained at all costs:

1) Available credits never go below zero.  
2) Card status matches what happened: charged → available goes down; owed → due goes up. 
3) The accounting adds up across many cards. For example:
   - If a company purchased 100 credits and received 3 cards costing 7 credits (all charged), the remaining balances must be `availableCredits = 79` and `dueCredits = 0`.
   - If one of those cards was owed instead, the balances should reflect that split (e.g., `availableCredits = 86` and `dueCredits = 7`).

The main problem we’ll solve in this article is how to keep these invariants correct under concurrency. To make the comparison concrete, we’ll start from the naive implementation for the endpoint that creates a card (which fails under concurrency) and keep tweaking it throughout the post:

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

As you can see, this implementation has the read-modify-write problem we discussed in the previous post, so it will end up saving the wrong value in the database under concurrency.

From now on, we will compare different options and see which one is best for each case: waiting, retries/aborts, or moving the complexity elsewhere.

Alright. Let’s start with the most straightforward approach: make the second request wait.

## Option 1: Row-level locks (`SELECT … FOR UPDATE`)

Row-level locking is the simplest contract: before you change a company’s credits (because a card is being created or deleted), you make sure you’re the only request allowed to touch that company’s balance for a moment.

In Postgres, the most direct way to do that is to lock the company row, do the credits work, then commit. If two card creations hit the same company at the same time, one proceeds and the other waits. Concurrency becomes a queue per company.

### The mechanism (lock first, then charge, then persist)

The contract is deliberately simple. You can explain it in one minute, and that is the point. When you are debugging a money-like counter under load, you do not want clever. You want obvious.

1) Start a transaction.  
2) Lock the company row (`SELECT … FOR UPDATE`).  
3) Compute the card outcome (charged vs owed) based on the *current* balance.  
4) Persist both the card and the updated company balances.  

Here’s the shape in code:

```ts
async function saveCardAndChargeCredits() {
  // ... validate input address, build `card`, load `campaign`, etc. (omitted for brevity)

  await ctx.db.transaction(async (tx) => {
    companyRepo.setDb(tx);
    cardRepo.setDb(tx);

    const lockedCompany = await companyRepo.findForUpdate(campaign!.companyId);
    if (!lockedCompany) throw new Error("Company not found");

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

Two details matter here:

- The lock has to be taken **inside the same transaction** that charges credits and writes the result. Otherwise you’re not protecting the critical section.
- Your repository needs to run on the transaction connection in the ORM (`tx` in this case). Otherwise you can “lock” in one connection and “save” in another, which is like putting a “Reserved” sign on a table… in a different restaurant.

### The concurrency “dance” (what actually happens)

To see how this works internally, assume two card creations arrive at the same time for the same company, and each card costs 7 credits. Let's see how it would behave in two scenarios:

Scenario A (company has enough prepaid credits):

1) Request A begins and locks the company row (`FOR UPDATE` succeeds). It sees 100 available, 0 due.  
2) Request B begins and tries to lock the same row. It blocks and waits.  
3) A charges the card (100 → 93), marks it charged, writes, and commits. Lock released.  
4) B unblocks, locks the row, and now sees the updated balance (93 available, 0 due).  
5) B charges (93 → 86), marks its card charged, writes, commits.  

End state: 86 available, 0 due, both cards charged.

Scenario B (company doesn’t have enough prepaid credits for the second card):

1) A locks, sees 10 available, 0 due.  
2) B blocks on the lock.  
3) A charges (10 → 3), commits.  
4) B unblocks, locks, sees 3 available, 0 due.  
5) B can’t charge 7 from prepaid credits, so it marks the card owed and increases due by 7 (available stays 3).  

End state: 3 available, 7 due, one charged and one owed.

Notice what the lock is really doing: it’s not “doing math for you”. It’s forcing a clean serial order so each request makes its decision using current state.

### Seeing it in Postgres (so it’s not a black box)

If you are going to pick waiting as your failure mode, you need to be able to observe it. Otherwise the first time you notice lock contention is when customers tell you the app feels slow.

The source of truth here is Postgres itself. `pg_stat_activity` shows the sessions currently connected to the database (including the SQL they’re running), and `pg_blocking_pids(pid)` tells you which backend PIDs are blocking a given session.

This query joins both to answer the practical question: “who is blocked by who?”

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

Hypothetical output when three concurrent card creates hit the same company:

| blocked_pid | blocked_query                                    | blocking_pid | blocking_query |
|------------|---------------------------------------------------|--------------|----------------|
| 7002       | SELECT id FROM "company" WHERE id = $1 FOR UPDATE | 7001         | COMMIT         |
| 7003       | SELECT id FROM "company" WHERE id = $1 FOR UPDATE | 7001         | COMMIT         |

`blocked_pid` is the session that is waiting. `blocking_pid` is the one currently holding the lock. The `*_query` columns show what each side is doing. In this example, PIDs 7002 and 7003 are stuck at the `FOR UPDATE`, while 7001 is the one in front of the line.

This is also where production settings matter.

By default, a blocked query can wait indefinitely. In a real product, you typically want an upper bound. In Postgres you have three knobs that matter here:

- `lock_timeout`: how long a statement is allowed to wait to acquire a lock before Postgres errors.
- `statement_timeout`: how long a statement is allowed to run in total. This is a backstop for slow queries even when locks are not the only issue.
- `log_lock_waits`: logs lock waits that exceed a threshold so you can correlate slow requests with lock contention.

Where to set them depends on how strict you want to be:

- Globally in `postgresql.conf` (or via managed-DB parameter groups) if you want a consistent default.
- Per role or database with `ALTER ROLE ... SET ...` or `ALTER DATABASE ... SET ...` if only some workloads should be constrained.
- Per transaction with `SET LOCAL lock_timeout = '...'` if only the credits-critical section should be bounded.

Reasonable starting values are workload-dependent, but for user-facing APIs I usually start with something like a few hundred milliseconds to a couple seconds for `lock_timeout`, and then tune based on p95 and the failure mode I prefer. The downside of setting timeouts too aggressively is that you trade waiting for errors, and errors tend to trigger retries, which can amplify load if you are not careful.

### Coverage and deadlocks (the real footguns)

Row locks work because they force a serial order for one shared balance. But they only work as a system if the rule is universal: **every** endpoint that changes a company’s credits must take the same lock first.

In Manuscritten, that includes more than “create card”. For example, users can delete cards that haven’t been worked yet, and in that case we restore the credits. That delete path is just as much a “credits mutation” as creation, so it has to follow the same contract.

There is a second footgun that shows up as systems grow: lock ordering and deadlocks.

Postgres takes locks not only when you `SELECT … FOR UPDATE`, but also when you `UPDATE` rows. If two endpoints lock the same resources in different orders, you can deadlock even though each endpoint looks “reasonable” in isolation.

Here’s a simple deadlock-shaped collision using campaigns (a campaign is just a grouping of cards):

1) Card creation endpoint:
   - locks `company` (credits gate)
   - then locks/updates `campaign` (assigns credits / due credits)
2) Card deletion endpoint:
   - locks/updates `campaign` first (unassigns credits)
   - then locks `company` (restores credits)

If those two requests run at the same time, you can end up with:

- Tx A holds the company lock and waits for the campaign lock.
- Tx B holds the campaign lock and waits for the company lock.

That is a deadlock. Postgres will pick one transaction to abort, and now you are in retry land even though you chose waiting as your failure mode.

The fix is process discipline: pick a global lock order (e.g., always lock company first, then campaign) and enforce it everywhere credits move.

### Pros

Row locks are a great default because they are predictable. Under contention, requests do not bounce. They wait. That makes correctness easy to reason about and easier to explain to the rest of the team: we take turns per company.

They also work well when your “charge a card” workflow isn’t a single SQL statement. You can safely do multiple reads and writes inside the transaction, and as long as you lock first, the outcome matches a clean serial order.

And operationally, this is one of the nicest approaches to debug: Postgres can tell you who’s blocked, who’s blocking, and what they’re running.

### Cons (the queue can bite you)

The price you pay is latency under contention. If one company becomes a hotspot, row locks turn your critical section into a single-file line, and tail latency climbs fast.

Here is a concrete example you can actually picture.

Imagine one company is having a great day and is creating 10 cards per second, one every 100ms. So the first request arrives at second 0. The second at 0.1s. The third at 0.2s, and so on.

Now suppose the work inside the lock, the critical section, takes 300ms per request. That means we can only process one request every 300ms for that company, because only one request can hold the lock at a time.

At this point the problem should feel obvious. We receive a new request every 100ms, but we can only finish one every 300ms. If these requests did not need to lock the company row, they could run in parallel and this would not be a big deal. But here they cannot. They queue up.

To see how the queue grows, look at the first few requests.

The first request arrives at 0s and starts immediately. The second arrives at 0.1s, but the lock is still held, so it waits about 200ms until the first one finishes. Suddenly that second request has a total time around 500ms instead of 300ms.

The third request arrives at 0.2s. It waits about 100ms for the first request to finish and then a full 300ms for the second to run. Its total time is now roughly 700ms.

In general, each new request adds about 200ms of extra backlog, because 300ms of work arrives every 100ms of time. So the i-th request waits roughly `(i - 1) * 200ms` before it can even start.

That escalates fast. After 10 seconds, you have received about 100 requests. The 100th request arrives at `99 * 100ms = 9.9s`, then waits `99 * 200ms = 19.8s` just to acquire the lock, and then spends its own 300ms doing work. The 100th request finishes around the 30-second mark from when the burst started.

This is unsustainable.

This is how waiting becomes an outage. Tail latency climbs, clients time out, retries add load, and the queue feeds itself.

If you choose row locks, you have to ensure your per-company processing rate stays ahead of your per-company arrival rate. That usually means shrinking the critical section aggressively, and setting timeouts (`lock_timeout` and `statement_timeout`) so waiting cannot silently stretch into “forever” in production.

### When I’d pick it (and when I wouldn’t)

I’d pick row locks when the shared resource is clearly “credits per company” (one row can act as the gate), and the work inside the lock is small enough that the system can keep up with per-company arrival rates.

The boundary condition is simple: if one company’s requests arrive faster than one locked critical section can process, you build an ever-growing queue.

When you hit that boundary, you either:

- aggressively shrink the critical section, or
- switch strategies (atomic update, chunk leasing, single-writer), depending on which failure mode you prefer.

### Transition

Row locks solve correctness by making everyone wait their turn. But sometimes your shared resource isn’t naturally “one row”, or you want a mutex that spans a wider surface area than a single `FOR UPDATE`.

That’s where advisory locks come in: same “waiting” failure mode, enforced by a logical mutex key instead of a row lock.

## Option 2: Advisory locks (`pg_advisory_xact_lock`)

Row locks are great when your shared resource maps cleanly to a row. Advisory locks are what you reach for when you still want “one request at a time”, but you want to enforce it with a logical mutex key instead of a physical row lock.

In Postgres, an advisory lock is a lock you take on an arbitrary key you choose. In our case, the key is the company. You are basically saying: for this company ID, only one transaction is allowed to run the credits critical section at a time.

The behavior under contention is the same as row locks. Requests wait. The queueing and latency math does not go away. The difference is what you are locking.

### The mechanism

The basic pattern is to acquire the mutex at the start of the transaction, then run the same read decide write flow:

```ts
await ctx.db.transaction(async (tx) => {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${companyId}))`);

  companyRepo.setDb(tx);
  cardRepo.setDb(tx);

  const company = await companyRepo.find(companyId);
  if (!company) throw new Error("Company not found");

  company.chargeCard(card, campaign);
  await cardRepo.saveCard(card);
  await companyRepo.saveWithCredits(company);
});
```

Two important details:

- Use the transaction scoped form (`pg_advisory_xact_lock`) so Postgres releases it automatically on commit or rollback.
- Pick a keying scheme that is stable and consistent. If half the code locks by company ID and the other half locks by company name, you do not have a mutex. You have a false sense of security.

### Pros and cons

Advisory locks are flexible. They are useful when the thing you need to serialize is not naturally a single row, or it spans multiple tables. They also avoid having to lock a specific company row if the “gate” is more conceptual than relational.

Here is a concrete situation where that flexibility matters.

Imagine your “charge credits for a card” workflow touches several tables, and not all of them have a single obvious row you can lock that the whole team will naturally remember to lock first:

- `company_credits` stores the current balances (`available_credits`, `due_credits`).
- `credits_ledger` is append only and stores every credit mutation for audits and debugging.
- `company_usage_monthly` stores rollups for dashboards and alerts (for example, “credits spent this month”).
- `card` stores the card itself, including whether it ended up charged or owed.

Now picture what one request does, all for the same company:

1) Insert the new card row.
2) Decide charged vs owed based on the current credit balances.
3) Update `company_credits` (decrease available, or increase due).
4) Insert one row into `credits_ledger` that records what happened.
5) Update `company_usage_monthly` so the UI and alerts stay current.

If you rely on row locks, you need a very strict convention about which row is the gate and when it is locked. In a real codebase, some endpoints will accidentally do step 4 or step 5 first, or skip the gate entirely because they “only touched the ledger”, and now you are back in concurrency land.

With an advisory lock, the rule is easier to express: at the top of the transaction, take one mutex by `companyId`. After that, you can touch multiple tables in any order and you still get “one credits mutation at a time per company”, without inventing a multi-row locking scheme that everyone has to memorize.

The tradeoff is discipline. A row lock is enforced by touching the row. Advisory locks are enforced by everyone agreeing to take the same mutex key. It is easier to accidentally bypass. It is also less obvious in the database that “this company is locked”, because the lock is not tied to a table row.

### When to pick it

Pick advisory locks when you want the same waiting behavior as row locks, but you need a mutex that spans a wider surface area than a single row. If a company row is a clean gate and you can lock it, row locks remain the simplest and safest default.

## Option 3: Atomic updates (reservation)

So far, both row locks and advisory locks solve the problem the same way. They force requests to take turns.

Atomic updates keep that same waiting behavior, but they change something important. Instead of reading the balance in your application, deciding, and then writing the final numbers back, you encode the decision into a single SQL statement.

That is a big deal because it shrinks the critical section. You are not doing "read in the app, compute in the app, write the result". You are asking Postgres to do an atomic read modify write in one go.

### The simplest version

If your rule is just "do not go below zero", the simplest shape looks like this:

```sql
UPDATE company
SET available_credits = available_credits - $cost
WHERE id = $company_id AND available_credits >= $cost
RETURNING available_credits;
```

This does two things at once:

- It checks the balance.
- It updates it, but only if the check passes.

Under concurrency, Postgres still takes a row lock for the update, so the second transaction will wait. The difference is that you are not holding the lock while your application does extra work. You are getting in, updating, and getting out.

### A reservation that matches our charged vs owed rules

Our yardstick is slightly more complex. If there is not enough prepaid credit, we do not set available credits negative. We keep available credits as they are and increase due credits by the full card cost.

You can still encode that decision as a single statement by using a CTE that tries the charged path first, and only runs the owed path if the charged update did not happen:

```ts
async reserveCreditsForNewCardAtomic(
  companyId: string,
  cardCost: number,
): Promise<{
  beforeAvailableCredits: number;
  beforeDueCredits: number;
  afterAvailableCredits: number;
  afterDueCredits: number;
  charged: boolean;
}> {
  if (cardCost <= 0) {
    throw new Error("Card cost must be > 0");
  }

  const rows = await this.db.execute(sql`
    WITH charged AS (
      UPDATE "company"
      SET available_credits = available_credits - ${cardCost}
      WHERE id = ${companyId} AND available_credits >= ${cardCost}
      RETURNING
        (available_credits + ${cardCost})::text AS before_available_credits,
        due_credits::text AS before_due_credits,
        available_credits::text AS after_available_credits,
        due_credits::text AS after_due_credits,
        true AS charged
    ),
    owed AS (
      UPDATE "company"
      SET due_credits = due_credits + ${cardCost}
      WHERE id = ${companyId} AND NOT EXISTS (SELECT 1 FROM charged)
      RETURNING
        available_credits::text AS before_available_credits,
        (due_credits - ${cardCost})::text AS before_due_credits,
        available_credits::text AS after_available_credits,
        due_credits::text AS after_due_credits,
        false AS charged
    )
    SELECT * FROM charged
    UNION ALL
    SELECT * FROM owed
  `);

  const row = rows[0] as
    | {
        before_available_credits: string;
        before_due_credits: string;
        after_available_credits: string;
        after_due_credits: string;
        charged: boolean;
      }
    | undefined;

  if (!row) throw new Error("Company not found");

  return {
    beforeAvailableCredits: Number(row.before_available_credits),
    beforeDueCredits: Number(row.before_due_credits),
    afterAvailableCredits: Number(row.after_available_credits),
    afterDueCredits: Number(row.after_due_credits),
    charged: row.charged,
  };
}
```

The nice property is that the database returns a single answer that is already consistent. If it says "charged", you know credits were deducted. If it says "owed", you know due credits were increased.

### The endpoint shape (transaction, reserve, then persist)

Once you have a reservation function like that, the controller flow becomes:

```ts
await ctx.db.transaction(async (tx) => {
  // withLockRetry could wrap this if you add timeouts and want retries later.

  companyRepo.setDb(tx);
  cardRepo.setDb(tx);

  const reservation = await companyRepo.reserveCreditsForNewCardAtomic(
    campaign.companyId,
    cardCost,
  );

  companyRef.setAvailableCredits(reservation.afterAvailableCredits);
  companyRef.setDueCredits(reservation.afterDueCredits);

  if (reservation.charged) {
    card.markAsCharged();
  } else {
    card.markAsOwed();
  }

  await cardRepo.saveCard(card);
});
```

### Why this tends to be much faster than `SELECT ... FOR UPDATE`

With row locks, a typical implementation ends up doing at least two database roundtrips in the hot path:

1) `SELECT ... FOR UPDATE` to acquire the lock.
2) `UPDATE` to write the new balances.

With atomic reservation, the lock acquisition and the balance update happen inside one statement, so you save a roundtrip and reduce time spent in the critical section.

That difference shows up immediately in load tests.

If we compare the two approaches using the k6 test we described in the previous post, we can see how long the system takes to process a burst of card creation requests for the same company:

With `FOR UPDATE`, `create_card_duration` had `avg=5.44s` and `p95=38.83s`.

With atomic reservation, `create_card_duration` had `avg≈532ms` and `p95≈923ms`.

Those numbers are per-request processing time, not a rate.

In this run we sent the same workload in both cases: 200 card creations distributed across 20 virtual users. So, very roughly, each virtual user performs about 10 requests.

If the average request takes about 532ms, that whole run finishes in a few seconds. If the average request takes 5.44s, the run is on the order of a minute. And the p95 is the scary part: it tells you that 1 out of 20 requests can take tens of seconds under contention, even though nothing is “down”.

The practical takeaway is that atomic reservation keeps the same correctness guarantee as row locks, but with a much smaller critical section. That is what buys you lower tail latency and makes this approach viable for hot companies.

### Tradeoffs

Atomic updates shift complexity into SQL. That is both the point and the downside.

One concrete tradeoff is how it changes where domain logic lives. If your domain model used to own the full decision, you might now have part of that decision embedded in SQL and part of it in the application layer. It is still correct, but it can feel less clean from a DDD perspective.

### When to use it

This option shines when:

- your invariant can be expressed as one atomic statement per shared resource, and
- your bottleneck is time spent holding a lock and doing extra work in the application.

Further reading:

```text
https://blog.pjam.me/posts/atomic-operations-in-sql
```

If you cannot encode the invariant into a single statement, or you want to keep a more "naive" multi-step flow while still getting correctness, Postgres has another tool. It changes the failure mode from waiting to abort and retry.

## Option 4: Serializable transactions (`SERIALIZABLE`)

So far, the strategies we have seen turn concurrency into waiting. Only one request is allowed to be inside the credits critical section at a time, and everyone else queues up.

Serializable transactions take a different approach. They let requests run concurrently, and only at commit time Postgres checks whether the result is equivalent to some serial order. If it is not, Postgres aborts one of the transactions.

In other words, the failure mode changes. With locks, the system says: wait. With serializable, the system says: go ahead, but I might kill you at the end.

### What that means in practice

This is the version that catches people by surprise.

You can keep a very similar high-level flow to the naive baseline. You still read, decide, and write. The difference is you run the transaction at serializable isolation, and you have to be willing to retry when Postgres tells you there was a conflict.

The important part is the retry rule. If your product requires that a card creation eventually succeeds, you need retries. Otherwise a burst of concurrent requests becomes a burst of failed requests.

### The concurrency picture

Imagine a company has 100 available credits, and two card creations arrive at the same time. Each card costs 7 credits.

Request A starts a serializable transaction, reads 100, decides the card is charged, and prepares to write 93.

Request B does the same thing in parallel. It also reads 100, also decides charged, and also prepares to write 93.

Now the important moment is commit.

One of the transactions will commit first. Suppose A commits. The company now has 93 available credits.

When B tries to commit, Postgres realizes it cannot produce a result that matches any clean serial order, because B's decision was based on a balance that is no longer current. So Postgres aborts B with a serialization error (`SQLSTATE 40001`) and rolls back the whole transaction.

Correctness is preserved, but B did not succeed. If your product expects the second card to be created, you have to retry the whole transaction. On the retry, B reads 93, writes 86, and commits. 

### A minimal retry wrapper

In Postgres, the common serialization error is `SQLSTATE 40001`. A minimal retry loop looks like this:

```ts
export async function withLockRetry<T>(
  fn: (attempt: number) => Promise<T>,
  {
    maxAttempts = 3,
    baseDelayMs = 50,
  }: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt++;
    try {
      return await fn(attempt);
    } catch (err: any) {
      const code = err?.code ?? err?.cause?.code;
      const isSerializationFailure = code === "40001";

      if (!isSerializationFailure || attempt >= maxAttempts) {
        throw err;
      }

      const delay = baseDelayMs * attempt;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
```

Then you wrap your transaction:

```ts
await withLockRetry(async () => {
  await ctx.db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);

    companyRepo.setDb(tx);
    cardRepo.setDb(tx);

    const company = await companyRepo.find(campaign.companyId);
    if (!company) throw new Error("Company not found");

    company.chargeCard(card, campaign);
    await cardRepo.saveCard(card);
    await companyRepo.saveWithCredits(company);
  });
});
```

### Pros and cons

The upside is that you can keep a more natural multi-step flow without manually taking locks everywhere. In some codebases that feels cleaner.

The downside is that under contention, the system can start aborting a lot of requests. If you retry aggressively, you can create retry storms. Latency becomes unpredictable because the path is attempt, abort, retry.

The other big footgun is side effects. If you send emails, call external APIs, or enqueue jobs inside a transaction that might be retried, you can double do the side effect. Serializable isolation pushes you toward strict idempotency and careful separation between transactional work and side effects.

### When to use it

Serializable tends to work best when conflicts are relatively rare, but correctness needs to be strong across more complex reads and writes than you can express in one statement.

If you expect sustained contention on the same company, you are trading a waiting queue for an abort and retry storm. That might be better or worse depending on your product, but it is still pain.

Next, we will look at an approach that moves that contention out of Postgres entirely, by preallocating chunks of credits and spending them at high throughput elsewhere.

## Option 5: Chunk leasing (token bucket style)

So far, every option has one thing in common. Every request still has to touch Postgres in order to decide charged versus owed and update the balance correctly. The only thing we have been changing is how painful that interaction is.

Chunk leasing is a bigger move. Instead of touching Postgres on every card creation, you reserve a big chunk of credits once, then you spend from that chunk at high throughput. When the chunk is empty, you go back to Postgres and reserve another one.

The key idea is amortization. You do the expensive, contended operation rarely, and you do the per request operation against something fast, like Redis.

### A concrete example

Imagine a company has 10,000 prepaid credits and one of its campaigns starts creating cards in bursts. If we try to update the Postgres balance on every single card, we will eventually bottleneck on per request locking.

With chunk leasing, we might reserve credits in blocks of 300:

1) Postgres: take 300 credits from the company balance and record that this chunk is now reserved.
2) Redis: store a counter for this company with 300 tokens.
3) Each card creation does a fast atomic decrement in Redis.
4) When the counter hits zero, refill again by reserving another 300 from Postgres.

Now instead of one Postgres balance mutation per card, you have one per 300 cards. That is the throughput win.

### The Postgres primitive: take a chunk safely

To do prepaid correctly, the chunk has to come from a real balance. The simplest pattern is an atomic update that only succeeds if the balance is high enough:

```sql
UPDATE accounts
SET balance = balance - :bucketSize
WHERE account_id = :id AND balance >= :bucketSize
RETURNING balance;
```

If it returns a row, you got the chunk. If it returns nothing, the company does not have enough prepaid credits, and you have to decide what your product does next.

### The Redis primitive: spend fast and atomically

Once a chunk exists, the per request operation can be a single atomic decrement. You can do it with `DECRBY`, or you can wrap the logic in a Lua script to keep it atomic.

This is where Redis shines for concurrency. Redis executes commands sequentially per shard, so a single operation like `DECRBY` is atomic from the point of view of your application. You do not have to worry about two servers racing and both successfully spending the same credits from the same bucket key.

It is also fast. A Redis in memory decrement is typically sub millisecond, often in the tens or hundreds of microseconds. A Postgres balance mutation usually costs milliseconds and has more overhead, especially under contention. Exact numbers depend on network, load, and how much work you do in the critical section, but the difference in shape is consistent. Redis is a very tight, single operation. Postgres is a transaction and disk backed state.

The hard part is not decrementing. The hard part is everything around it.

### What if the request fails after spending in Redis?

This is the question you have to be able to answer before you build this.

Imagine the flow is:

1) Spend 7 credits from the Redis bucket for company A.
2) Create the card in Postgres.

What happens if step 1 succeeds and step 2 fails?

If you do nothing, you have "spent" credits for a card that does not exist. That is another money bug, just in a different direction.

In practice, you need one of these patterns:

- Compensation in the request path. If the DB transaction fails, you increment the Redis bucket back to refund the spend. Then you still need a crash recovery story for the window between spend and refund.
- A durable spend log plus reconciliation. Every spend gets an idempotency key and is written to a durable log (DB ledger or an append only stream) so a background job can reconcile: either confirm it (card exists) or refund it (card never got created).

Either way, chunk leasing is a shift in where the complexity lives. You are buying throughput by making Postgres less hot. You are paying for it with recovery and accounting discipline.

### The real footgun: crashes and reconciliation

If your process reserves 300 credits and then dies after spending 57 of them, what happens to the remaining 243?

If you have no durable record, those credits can be lost or double spent. That is not a performance bug. That is a money bug.

This is why chunk leasing almost always comes with extra machinery:

- a lease or TTL on the chunk, so it can expire and be reclaimed
- a durable log or ledger of spends, so you can reconstruct what happened after a crash
- a reconciliation job that corrects drift

If you are not willing to build that machinery, do not do this. It is not a free lunch.

### When it makes sense

Chunk leasing makes sense when you truly have a throughput problem per company, and you can justify the added complexity. It is a common pattern in distributed rate limiting, and the same idea applies here. You are turning per request balance checks into a fast counter operation, and paying complexity at refill and recovery time.

Further reading:

```text
https://en.wikipedia.org/wiki/Token_bucket
https://github.com/RussellLuo/ratelimiter
https://stripe.com/blog/how-we-built-it-usage-based-billing
```

## Option 6: Queue and single writer

Chunk leasing is what you do when the request path is too hot and you want to spend credits fast. A single writer is what you do when you want the cleanest correctness story at scale. You stop trying to mutate a shared counter from many web requests at once.

Instead, you model card charging as usage events.

This shifts the mental model. In the previous options, the goal was, "keep the balance correct at request time". In a single writer system, the primary goal becomes, "do not lose events, do not double apply events, and keep an audit trail you can replay." The balance becomes derived state.

### The architecture in one picture

For every chargeable action, you emit one usage event.

In Manuscritten terms, that event might be, "card created for company X with cost 7, campaign Y, card Z".

Those events go into a queue or stream where ordering is preserved per company. The important property is, "all events for the same company go to the same partition".

Then a consumer group processes the stream. Only one consumer processes a given partition, so only one consumer is the writer for a given company at a time.

Now you truly have one writer per company, without locks in the web request path.

### A concrete example

Imagine a company is creating cards in bursts. With a single writer, the web API does not try to decide charged versus owed and mutate credits directly. It only does one thing. It appends an event:

- companyId: 123
- cardId: abc
- cost: 7
- type: card.created

The consumer reads that event and applies it in order:

1) Check idempotency. If this event was already applied, ignore it.
2) Append it to a durable ledger.
3) Update a materialized balance view, if you keep one.

This is where the charged versus owed decision happens. And because events are processed one at a time per company, there is no race.

### Prepaid credits and overages

This approach is very common in AI companies and other usage based products where prepaid and pay as you go live together.

The flow is:

1) Burn down prepaid credits while there are credits left.
2) After prepaid is exhausted, keep recording usage as overage.
3) Bill the overage later.

This is why it does not always preserve the same invariant as the previous options. If you allow overage, you are intentionally not enforcing "balance never goes below zero" in the web request path. You are enforcing "billing is correct when the ledger is processed."

That can be a great trade if your product supports it. It can also be unacceptable if you need a hard stop.

### If you need a hard stop

If the business requirement is, "do not create the card if prepaid credits are insufficient", you need the API to wait for the single writer's decision.

In practice that looks like one of these:

- Sync over async. The API enqueues the event and then blocks until the consumer writes back a decision, with a timeout.
- Authorize and capture. The API reserves an upper bound first, then later the consumer finalizes the exact spend.

These patterns can work, but they add latency and complexity. This is one reason why many systems choose to allow overage instead.

### The real footguns: idempotency and outbox

A single writer system can be incredibly correct, but only if you get two basics right.

First, idempotency. Events must have a unique idempotency key so retries and duplicates do not double charge. The consumer should store that key in durable state and only apply it once.

Second, event emission must be reliable. If your API both writes business state and emits a usage event, you need to avoid the split brain failure:

- state commit succeeded, but the event was never emitted
- event emitted, but state commit failed

The usual answer is the outbox pattern. You write an outbox row in the same database transaction as the business state, then a separate publisher reliably streams it to your queue.

### Pros and cons

The main upside is that you remove hot row contention from the web request path. Bursts become a backlog in your queue, not a lock queue in Postgres. You also get a natural place for a durable ledger and auditing.

The downside is that you are building infrastructure. You now own a queue, consumers, retry behavior, idempotency, and the operational surface area that comes with it. Failures become asynchronous and can be harder to reason about without good observability.

### When it makes sense

Single writer makes sense when your per company throughput is high, you care about auditability, and you can afford the architecture. It is also a very natural fit for hybrid billing models where overage is acceptable.

Further reading:

```text
https://stripe.com/blog/how-we-built-it-usage-based-billing
https://debezium.io/blog/2019/02/19/reliable-microservices-data-exchange-with-the-outbox-pattern/
https://www.confluent.io/learn/kafka-partition-key/
```

## Decision: what we chose in Manuscritten

All of the options above can be correct. The real question is which pain you are willing to live with.

In Manuscritten, we started with row level locks because they are the simplest correctness story. They worked, but the k6 test from the previous post made something clear. Under contention, tail latency got ugly.

Atomic reservation gave us the same correctness properties, but it reduced the critical section to a single statement. In practice, that was enough. It kept the system responsive even for hot companies.

Our internal contract is simple:

1) Reserve credits in the database using a single atomic function.
2) Use the returned result to decide charged versus owed.
3) Persist the card and the balance update in the same transaction.

If we ever hit a point where per company throughput grows past what a single row update can handle, our next step is chunk leasing with Redis. That trades database contention for reconciliation complexity, and we would only pay that price if we truly need it.

## Conclusion

If you take one thing from this post, let it be this. Picking a concurrency strategy is picking a failure mode.

Row locks and advisory locks fail by waiting. Serializable fails by aborting and forcing retries. Chunk leasing fails by making recovery and reconciliation part of your correctness story. A single writer fails by making your system architecture bigger.

None of those is universally right. They are right under different constraints.

If you are building a credits system today, my default recommendation is atomic reservation in Postgres. It is usually the best balance between correctness, performance, and operational complexity.

And then, the most important part. Whatever strategy you pick, make it a contract. Every endpoint that moves credits has to follow the same rule, or the bug will come back the moment the product grows.

Comment: what is the worst failure mode for you, waiting, retries and aborts, or accidental bypass, and why?
