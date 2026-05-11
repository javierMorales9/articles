# Series: Fixing Manuscritten's Payment System

## Summary

This series explains how we discovered a race condition in Manuscritten's credits system, reproduced it with k6, and evolved the implementation toward atomic credit updates in Postgres.

In Manuscritten, every company has a credit balance. Each card has a price. When a card arrives through the API, the system decides whether the card should consume available credits, become owed credits, or remain uncharged depending on the campaign state.

The bug lived in the card creation path, especially `recipients.save`. The original implementation loaded company and campaign state, computed the credit change in application memory, and later saved absolute credit values. Under concurrent card creation, two requests could compute from the same stale balance and overwrite each other's accounting result.

## Core Thesis

The bug was not simply that a transaction was missing. The bug was that the transaction persisted a decision made from stale state.

The final direction is to move the critical credit mutation into Postgres itself: use atomic updates for company credits, and update campaign credits with deltas instead of stale absolute values.

## Post 1: The Race Condition Hidden Inside a Successful API Call

### Purpose

Explain the bug clearly before discussing tests or fixes.

### Covers

- How Manuscritten's credit model works:
  - `Company.availableCredits`
  - `Company.dueCredits`
  - `Card.price`
  - card payment states such as charged, owed, and uncharged
- Why `recipients.save` is the narrative center of the series.
- The original `recipients.save` flow:
  - load campaign/company state;
  - create the card;
  - call `company.chargeCard(card, campaign)`;
  - save card, campaign, and company;
  - persist absolute credit values.
- The lost-update interleaving with two concurrent card creation requests.
- Why having a database transaction did not prevent the bug.
- The core invariant:

```text
finalAvailableCredits = initialAvailableCredits - totalChargedCardCost
```

### Leaves For Later

- The k6 harness and reproducibility details.
- The full comparison of Postgres concurrency strategies.
- The final atomic update implementation.

## Post 2: Proving The Bug With k6

### Purpose

Show how we turned the race condition from a plausible theory into a reproducible accounting failure.

### Covers

- Why reasoning about the race condition was not enough.
- The k6 load test shape:
  - seed a company with a known credit balance;
  - create many cards concurrently;
  - know the expected total card cost;
  - fetch the resulting company/campaign/card summary state;
  - assert that credits match the expected totals.
- The important test invariant:

```text
actualFinalCredits = initialCredits - sum(createdCardPrices)
```

- How the test exposed successful API requests producing incorrect final accounting.
- The first robust fix based on row-level locks:
  - lock the relevant company/campaign rows;
  - compute against current state inside the transaction;
  - retry transient lock/deadlock/serialization failures.
- Why the lock-based version was a useful first fix and a useful teaching step.

### Leaves For Later

- The complete strategy comparison.
- Why the final hot path moved from explicit row-level locks to atomic updates.

## Post 3: Choosing The Fix For Postgres

### Purpose

Compare the realistic concurrency strategies and explain why the final `recipients.save` implementation uses atomic updates.

### Covers

- Options considered:
  - row-level locks;
  - atomic updates;
  - advisory locks;
  - serializable transactions;
  - processing credit mutations in a single worker.
- What each option guarantees.
- What each option costs in latency, operational complexity, contention, and failure modes.
- Row-level locks as the clearest correctness fix.
- Atomic updates as the final direction for the card-creation hot path.
- The key company update shape:

```sql
UPDATE company
SET available_credits = available_credits - $cardCost
WHERE id = $companyId
  AND available_credits >= $cardCost;
```

- The owed-credit fallback when available credits are not enough.
- Campaign updates by delta instead of saving stale absolute values.
- Why the final implementation keeps the most contentious mutation inside Postgres.

### Existing Material

`post3/article.md` already exists and overlaps with this post. It should be reviewed before further drafting so the ending matches the final implementation: atomic updates in `recipients.save`, with row-level locks treated as an intermediate step rather than the final answer.
