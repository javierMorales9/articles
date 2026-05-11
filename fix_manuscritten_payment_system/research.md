# Research: Fixing Manuscritten's Payment System Race Condition

## Series Status

This series is about how Manuscritten discovered that its credits system had a race condition, how we reproduced it with load tests, and how the implementation evolved toward safer credit mutations.

Important workflow note:
- `commits.md` defines the article range as `08b643fd0971b58d6776554be538269c1fa766cf..7b9f198a7078b75de658872ef2b1e42084c157e4`.
- The snapshot worktree is detached at `7b9f198a7078b75de658872ef2b1e42084c157e4`.
- The range includes the original `recipients.save` race condition, the k6 reproduction, the first lock-based fix, and the later atomic update implementation.
- The final implementation to tell in the series is the atomic update version of `recipients.save`, with row-level locks treated as an intermediate step in the investigation.

Existing article material:
- `post3/article.md` already exists and compares concurrency strategies for a credits system.
- `post1/schema_ref.png` exists.
- `research.md` and `series.md` did not exist before this research pass.

## Core Domain

Manuscritten sells handwritten-letter sending as a product. Each company has a credit balance and each card has a computed price. The critical accounting fields are:

- `Company.availableCredits`: prepaid credits the company can spend now.
- `Company.dueCredits`: credits owed because a card was accepted when the company did not have enough available credits.
- `Campaign.assignedCredits`: credits assigned to cards in the campaign.
- `Campaign.dueCredits`: owed credits belonging to that campaign.
- `Card.price`: the cost of the card.
- `Card.paymentStatus`: `charged`, `owed`, or `uncharged`.

The main invariant is that card creation must not lose credit mutations under concurrency. If N cards are created concurrently, the company and campaign balances must reflect the total price of those N cards, not just the last transaction that happened to write.

## Main Endpoint: `recipients.save`

The most important method is `save` in:

```text
ref/apps/web/src/server/api/card/recipients.ts
```

This method is executed when new cards are created through the API. Public API routes call into it, including:

```text
ref/apps/web/src/app/api/public/card/route.ts
ref/apps/web/src/app/api/card/route.ts
ref/apps/web/src/app/api/hubspot/add-contact-to-campaign/route.ts
```

The endpoint is critical because automated integrations can send many cards at the same time. That makes it the natural place where a read-modify-write bug becomes visible.

### Original Shape At The Base Commit

At `08b643fd0971b58d6776554be538269c1fa766cf`, the simplified flow in `recipients.save` was:

1. Load the campaign.
2. Load the company.
3. Validate and normalize the input address.
4. Build a new `Card`.
5. Validate the card address with Google.
6. Mutate domain objects in memory:
   - `campaign.addVariables(...)`
   - `company.chargeCard(card, campaign)`
7. Open a transaction.
8. Save the card, campaign, and company with fixed values.
9. Commit.

The dangerous part was that `company.chargeCard(card, campaign)` happened after reading a company snapshot, and persistence later wrote the computed `availableCredits` / `dueCredits` values back to the database.

Simplified pseudocode:

```ts
const campaign = await campaignRepo.find(input.campaignId);
const company = await companyRepo.find(campaign.companyId);

const card = Card.new(...);

company.chargeCard(card, campaign);

await db.transaction(async (tx) => {
  await cardRepo.saveCard(tx, card);
  await campaignRepo.save(tx, campaign);
  await companyRepo.saveCompany(tx, company);
});
```

Equivalent SQL shape:

```sql
BEGIN;

SELECT available_credits, due_credits
FROM company
WHERE id = $company_id;

-- Application computes:
-- new_available_credits = old_available_credits - card_price

UPDATE company
SET available_credits = $new_available_credits,
    due_credits = $new_due_credits
WHERE id = $company_id;

COMMIT;
```

The transaction protected the writes inside one request, but it did not protect the read-modify-write sequence across concurrent requests because the relevant company and campaign state had already been read outside the transaction.

## The Race Condition

The failure mode is a classic lost update.

Concrete interleaving:

1. Company starts with `availableCredits = 100`.
2. Request A loads the company and sees `100`.
3. Request B loads the company and also sees `100`.
4. A creates a card costing `7`, computes `93`, and saves.
5. B creates another card costing `7`, also computes `93`, and saves.
6. Both cards exist, but the company balance is `93` instead of `86`.

No exception is required for this to happen. Every individual request can return success. The bug is that the final database state does not represent the sum of all successful operations.

The same class of bug can affect:

- `Company.availableCredits`
- `Company.dueCredits`
- `Campaign.assignedCredits`
- `Campaign.dueCredits`
- purchase compensation flows that move `dueCredits` into assigned/available credit state

## Domain Method: `Company.chargeCard`

The central domain operation is:

```text
ref/packages/domain/company/Company.ts
```

`Company.chargeCard(card, campaign)` decides whether a card is charged, owed, or uncharged depending on campaign type and current company balance.

Important behavior:

- For one-time campaigns in draft state:
  - company credits are not spent immediately.
  - campaign assigned credits increase.
  - card stays `uncharged`.
- For automated campaigns and scheduled/single flows:
  - if the company has enough available credits, consume credits and mark the card `charged`.
  - if not, increase due credits and mark the card `owed`.

This method is domain-correct only if it receives a current balance. The race condition came from calling it with stale company/campaign state.

## Reproducing The Bug With k6

The series introduced k6 load tests under:

```text
ref/apps/web/src/tests/performance/
```

Key files:

- `concurrent_credits_flow.ts`
- `concurrent_credits_purchase_flow.ts`
- `create_cards_for_campaign.ts`
- `run_k6_with_seed.ts`

The first important test shape was:

1. Seed a company with a known initial credit balance.
2. Seed campaigns, card design, envelope design, and sender data.
3. Start the web server against a temporary Postgres database.
4. Run concurrent requests against `POST /api/public/card`.
5. Fetch company and card summary data.
6. Assert that final credits match the total price of all created cards.

`run_k6_with_seed.ts` automates the local performance-test setup:

- starts a Postgres 16 testcontainer,
- runs migrations,
- seeds a known company,
- starts the web server,
- runs the selected k6 script.

`concurrent_credits_flow.ts` exercises several concurrent flows:

- creating automated cards,
- creating one-time cards,
- deleting cards,
- activating a one-time campaign,
- creating single cards,
- deleting single campaigns.

`concurrent_credits_purchase_flow.ts` adds purchase compensation under concurrency:

- create cards until due credits appear,
- submit a dev-only purchase,
- verify company `dueCredits` returns to zero,
- verify card summary `owedTotal` returns to zero,
- verify campaign `dueCredits` returns to zero.

The k6 tests matter editorially because they turn the bug from a theoretical database race into a reproducible accounting failure.

## Intermediate Fix: Row-Level Locks

The first robust fix in the range serialized credit mutations with row-level locks.

Main files:

```text
ref/apps/web/src/server/api/card/recipients.ts
ref/packages/db/repositories/company/companyRepo.ts
ref/packages/db/repositories/campaign/campaignRepo.ts
ref/packages/db/withLockRetry.ts
```

In `CompanyRepository.findForUpdate`, the code locks the company row:

```sql
SELECT id
FROM "company"
WHERE id = $id
FOR UPDATE;
```

The `recipients.save` flow at `7358646` was:

1. Load campaign/design/company data for validation.
2. Build the card.
3. Validate the address.
4. Run a retryable transaction via `withLockRetry`.
5. Inside the transaction:
   - bind repositories to `tx`,
   - lock company with `companyRepo.findForUpdate(...)`,
   - lock campaign with `campaignRepo.findForUpdate(...)`,
   - re-check campaign/company consistency,
   - call `lockedCompany.chargeCard(card, lockedCampaign)`,
   - save card,
   - save campaign credits,
   - save company credits.

The important change is that the domain decision happens after acquiring locks and inside the same transaction that writes the result.

Simplified pseudocode:

```ts
await withLockRetry(async () => {
  await db.transaction(async (tx) => {
    companyRepo.setDb(tx);
    campaignRepo.setDb(tx);
    cardRepo.setDb(tx);

    const lockedCompany = await companyRepo.findForUpdate(campaign.companyId);
    const lockedCampaign = await campaignRepo.findForUpdate(input.campaignId);

    lockedCompany.chargeCard(card, lockedCampaign);

    await cardRepo.saveCard(card);
    await campaignRepo.saveWithCredits(lockedCampaign);
    await companyRepo.saveWithCredits(lockedCompany);
  });
});
```

Equivalent SQL shape:

```sql
BEGIN;

SELECT id
FROM company
WHERE id = $company_id
FOR UPDATE;

SELECT id
FROM campaign
WHERE id = $campaign_id
FOR UPDATE;

-- Application computes against the locked/current state.

UPDATE card ...;
UPDATE campaign SET assigned_credits = $value, due_credits = $value ...;
UPDATE company SET available_credits = $value, due_credits = $value ...;

COMMIT;
```

The concurrency dance becomes:

1. Request A locks the company row and campaign row.
2. Request B reaches the same company row and waits.
3. A charges the card and commits.
4. B resumes and reads the now-current state.
5. B charges its card based on A's already-committed update.

This fixes the lost update because concurrent requests for the same company/campaign no longer compute from the same stale snapshot.

Editorially, this lock-based version is useful because it is the clearest correctness fix to explain first: make the second request wait, then compute from current state. It is not the final version of the hot path in the current snapshot.

## Retry Handling

`ref/packages/db/withLockRetry.ts` retries credit-sensitive transactions on transient database errors:

- `55P03`: lock not available
- `40P01`: deadlock detected
- `40001`: serialization failure

It also detects messages such as:

- deadlock detected
- could not serialize
- lock timeout
- canceling statement due to lock timeout

Default behavior:

- `maxAttempts = 3`
- `baseDelayMs = 50`
- linear backoff by attempt

This is important because once the system intentionally coordinates concurrent credit mutations, some requests may need to wait or retry instead of failing immediately.

## Avoiding Stale Credit Overwrites

The range also separates persistence methods:

- `CompanyRepository.saveWithCredits()`
- `CompanyRepository.saveWithoutCredits()`
- `CampaignRepository.saveWithCredits()`
- `CampaignRepository.saveWithoutCredits()`

Reason: normal updates should not accidentally persist stale credit columns. For example, a campaign editor save that loaded a campaign before a credit mutation should not later overwrite `assignedCredits` or `dueCredits` with old values.

This is a second kind of lost update. It is not only about two card creations racing with each other; it is also about generic "save the whole aggregate" operations overwriting credit fields they did not intend to change.

## Final Implementation: Atomic Updates In `recipients.save`

The final `recipients.save` implementation in the pinned snapshot uses atomic updates for the card-creation hot path. The first commit with the relevant final shape is `7b9f198`. Relevant commits include:

- `d034ab6`: introduces atomic update credit reservation logic in automatic single campaign creation.
- `4be9eab`: fixes company credit reservation and changes it into a CTE.
- `15a24d6`: removes row lock `SELECT ... FOR UPDATE` for an atomic update flow.
- `92d5a5e`: updates campaign with deltas instead of fixed values.
- `55d9679`: removes campaign lock from the save card endpoint.
- `d265bfd`: simplifies work inside the lock.
- `6aa2aab`: adds job keys and already has atomic reservation, but still uses the older campaign delta helper.
- `7b9f198`: switches the endpoint to the `mutateCampaignOnNewCard(...)` shape and updates received-card tracking in the non-charge branch.

In the final snapshot, `recipients.save` calls:

```text
CompanyRepository.reserveCreditsForNewCardAtomic(...)
CampaignRepository.mutateCampaignOnNewCard(...)
```

The method now has two important branches.

### Branch 1: cards that should not charge the company yet

For one-time draft campaigns, card creation should not decrement `Company.availableCredits`. The endpoint still needs to persist the card and update campaign accounting with a delta:

```ts
await ctx.db.transaction(async (tx) => {
  cardRepo.setDb(tx);
  campaignRepo.setDb(tx);
  companyRepo.setDb(tx);

  campaign.assignCredits(cardCost);
  card.markAsUncharged();
  campaign.markCardsReceived({
    newLastReceivedCreatedAt: card.createdAt,
  });

  await cardRepo.saveCard(card);

  await campaignRepo.mutateCampaignOnNewCard(
    input.campaignId,
    { assignedCredits: cardCost, dueCredits: 0 },
    campaign.state,
  );

  await campaignRepo.saveTrackingFields(campaign);

  const job = Job.new({
    type: JobType.CARD_CREATED_SIDE_EFFECTS,
    companyId: campaign.companyId,
    campaignId: campaign.id,
    total: 1,
    payload: {
      source: "recipients.save",
      cardId: card.id,
      cardOrigin: card.origin,
      cardCreatedAt: card.createdAt.toISOString(),
      owedTransitionedNow: false,
    },
  });

  await new GraphileJobEnqueuer(tx, ctx.eventCollector).enqueue(job);
});
```

The important accounting choice is `mutateCampaignOnNewCard(...)`: campaign credits are updated by delta, not by saving a possibly stale absolute aggregate value.

### Branch 2: cards that must charge or become owed

For automated/scheduled/single flows that should charge immediately, `recipients.save` uses:

```ts
const reservation = await companyRepo.reserveCreditsForNewCardAtomic(
  campaign.companyId,
  cardCost,
);
```

The endpoint then uses the returned before/after values to update the in-memory `Company` and `Card` state for domain events, observability, and persistence of the card itself.

`reserveCreditsForNewCardAtomic` uses a single SQL statement with CTEs:

```sql
WITH charged AS (
  UPDATE "company"
  SET available_credits = available_credits - $cardCost
  WHERE id = $companyId AND available_credits >= $cardCost
  RETURNING
    (available_credits + $cardCost)::text AS before_available_credits,
    due_credits::text AS before_due_credits,
    available_credits::text AS after_available_credits,
    due_credits::text AS after_due_credits,
    true AS charged
),
owed AS (
  UPDATE "company"
  SET due_credits = due_credits + $cardCost
  WHERE id = $companyId AND NOT EXISTS (SELECT 1 FROM charged)
  RETURNING
    available_credits::text AS before_available_credits,
    (due_credits - $cardCost)::text AS before_due_credits,
    available_credits::text AS after_available_credits,
    due_credits::text AS after_due_credits,
    false AS charged
)
SELECT * FROM charged
UNION ALL
SELECT * FROM owed;
```

This keeps the critical company credit mutation inside Postgres as one atomic statement:

- if there are enough credits, decrement `available_credits`;
- otherwise, increment `due_credits`;
- return before/after values so the domain object and observability context can be updated.

For campaign credits, the later implementation uses deltas:

```sql
UPDATE campaigns
SET assigned_credits = assigned_credits + $assignedDelta,
    due_credits = due_credits + $dueDelta
WHERE id = $campaignId;
```

That avoids overwriting a stale absolute campaign balance.

The concurrency dance changes from "request B waits for request A's explicit lock" to "Postgres evaluates each update against the current row value":

1. Request A and request B both try to reserve credits for the same company.
2. Each request sends an `UPDATE company SET available_credits = available_credits - cardCost WHERE available_credits >= cardCost`.
3. Postgres serializes the row update internally.
4. Each statement decides charged vs owed using the current row value at update time.
5. The application never computes and writes a stale absolute `availableCredits` value.

Editorially, this is the endpoint of the series: row locks are the first robust fix and the clearest teaching step; atomic updates are the tighter final version for the card-creation hot path.

## Why `recipients.save` Should Be The Narrative Center

The story should center on `recipients.save` because:

- it is called when cards enter the system through the API;
- automated campaigns and integrations can create cards concurrently;
- each card immediately touches money-like state;
- the bug is easy to explain with two concurrent calls to this one endpoint;
- the fix can be shown as an evolution of the same method:
  - naive read-modify-write,
  - row-level lock,
  - retry handling,
  - narrower persistence methods,
  - atomic company reservation,
  - campaign deltas.

The supporting material should exist to explain this endpoint, not replace it as the main character.

## Potential Article Breakdown

This is not yet the final `series.md`, but the research suggests a natural three-post structure:

1. **The bug: a successful API can still corrupt accounting**
   - Explain Manuscritten credits.
   - Walk through `recipients.save`.
   - Show the lost-update interleaving.
   - Explain why the transaction did not save us.

2. **Making the race condition reproducible**
   - Introduce the k6 setup.
   - Explain seeded data, known totals, and expected final balances.
   - Show how the test made the bug concrete.
   - Cover the first lock-based fix enough to connect test failure to test pass.

3. **Choosing the concurrency strategy**
   - Compare row-level locks, atomic updates, advisory locks, serializable transactions, and single-worker processing.
   - Use `recipients.save` as the running example.
   - End with the final choice: atomic update for the card-creation hot path.

`post3/article.md` already overlaps with item 3, but it currently appears to emphasize row-level locks more than the final atomic-update ending. It should be reviewed once `series.md` is created.

## Open Questions

- Should post 3 be revised to match the final code path once the range is updated?
