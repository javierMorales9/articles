# Commit range for this article series

- **Base ref**: `origin/main` at the time the series was first linked
- **FIRST (merge-base)**: `08b643fd0971b58d6776554be538269c1fa766cf`
- **LAST (HEAD)**: `7b9f198a7078b75de658872ef2b1e42084c157e4`
- **Snapshot**: `ref/` is pinned to `7b9f198a7078b75de658872ef2b1e42084c157e4`

## Why this LAST commit

I searched the history for the first version of `recipients.save` that has the important final shape for this series, ignoring later job/observability details:

- `CompanyRepository.reserveCreditsForNewCardAtomic(...)`
- `CampaignRepository.mutateCampaignOnNewCard(...)`
- a non-charge branch with `card.markAsUncharged()`
- campaign received-card tracking through `campaign.markCardsReceived(...)`
- campaign credit updates by delta instead of saving stale absolute values

Binary-search result:

```text
candidate_count=65
yes 32 df2ec279ea1c325b1a7235f927f7e4a2479958c0 added tests to update address endpoint
no  15 627a3fb3bec58b67d6894654ccff66b4c12faf4e Updated k6 tests to support different running cases: spawning a server and db, spawning just a db, with an existing server and db.
no  23 91144e5d5e2114bd80c8caf6a5d83b5d53f71e71 Fixed linter
no  27 14beb3b0955ad3c56cc77a0be0bea90fe190da6e Added first test for the card/recipients file. Fixed some errors with the new dates savings
yes 29 7b9f198a7078b75de658872ef2b1e42084c157e4 Fixed the error where the waiting for sync campaign was not being set to inactive after receiving the first card.
no  28 6aa2aab1737e38d7788b52d76bbf865dd076eca1 Added a job key to the Jobs so that we can retreive them afterwards during testing. And returned the jobKey from all the different endpoints that create such jobs
FIRST=7b9f198a7078b75de658872ef2b1e42084c157e4 7b9f198 Fixed the error where the waiting for sync campaign was not being set to inactive after receiving the first card.
PREV=6aa2aab1737e38d7788b52d76bbf865dd076eca1 6aa2aab Added a job key to the Jobs so that we can retreive them afterwards during testing. And returned the jobKey from all the different endpoints that create such jobs
```

`6aa2aab` already has atomic company reservation, but still uses the older campaign delta helper (`addCreditsDelta`). `7b9f198` is the first commit where the endpoint uses `mutateCampaignOnNewCard(...)` and the non-charge branch updates received-card tracking in the shape that matters for the article.

## Editorial scope

Focus the series on:

- the original `recipients.save` read-modify-write race condition,
- the k6 reproduction,
- the first lock-based fix,
- the later atomic update implementation in `recipients.save`,
- campaign credit deltas,
- purchase/due-credit compensation under concurrency.

The most important code path is:

```text
apps/web/src/server/api/card/recipients.ts
```

## Key commits

```text
f7aaf97 _first_
e4f36fd Refactor repositories to classes
b246820 Updated the company data public api route to return credit data about the company
7143f5b Installed all required dependencies for working with k6
e412463 Created the first test for simulating multiple concurrent requests to api create card endpoint
f4a7b72 Merge pull request #51 from javierMorales9/replicate_concurrent_card_creation_bug_with_k6
9cfcc42 added docs for k6 load tests
923471e create some row level locks on the company and campiagn in the automated card creation to avoid race conditions on the assigned and available credits respectively
c2b8642 Tested that the create and deletion of cards of all types of campaigns doesn't cause credits issues
8f53f3a Created a new dev only endpoint for creating purchases. Will be used for k6 simulations
097fc54 Added docs fro the credits lifecycle
e31e518 Add a k6 test to check if due credits and credit compensation is correctly managed
d9f88f4 Added deletion to the purchase k6 test and added some retry after lock behaviour for different elements to make sure they end up working.
23198f0 Ensure locking happens always in the same order to avoid deadlocks.
bc590fd Make the k6 test autorunable so that we can run it from ci
679485a Add validation in backend so a one time campaign cannot be scheduled if there are not enough credits to charge its cards.
51ac60d Moved withLockRetry to the packages/db package and add it to more places that try to modify credits concurrently.
b6502f4 Prevent possible deadlocks but ensurint the locking order when locking all campaigns of a company
98e795f Created two different save modes for the campaign to prevent lost updates between locked updates (that happen when the credits are updated, on new cards basically) and normal updated (like the ones they come from the campaign editor). In those cases, there could be the cause that the normal updates, after the lock is released try to update the campaign credit state that already had. Now we prevent it by making sure the normal update don't touch the credits.
b646372 Prevent normal company updates and credit company updates to collision with each other. All copmany updates should lock the row. So now we avoid touching the credits in normal company updates.
7358646 Installing drizzle on the root to make sure that turborepo can find it
9b58fd6 Merge pull request #53 from javierMorales9/make_concurrent_card_creation_on_the_api_safe
2f45d70 Log the lock timings in the card creation endpoint
627a3fb Updated k6 tests to support different running cases: spawning a server and db, spawning just a db, with an existing server and db.
d265bfd Simplify the work inside the lock
55d9679 Remove campaign lock from the save card endpoint
92d5a5e Update campaign with deltas instead of fixed values to avoid having to avoid having read modify write issues
18c8ee1 Moved the card saving outside the lock to test out how much time we can save
97d64ac put the card saving inside the transaction again. It was actually slower
b63b19b use campaign delta modification in the single endpont creation
15a24d6 Removed row lock SELECT ... FOR UPDATE for an atomic update flow. Let's see if it is faster
4be9eab fixed the company credit reservation. It didn't charge correctly. Transformed the query into a CTE
d034ab6 Introduce the atomic update credit reservation logic in the automatic single campaign creation endpoint
3cffaad Made the save endpoint use the chargeCard method in company to ensure all the state changes are preserved
14beb3b Added first test for the card/recipients file. Fixed some errors with the new dates savings
6aa2aab Added a job key to the Jobs so that we can retreive them afterwards during testing. And returned the jobKey from all the different endpoints that create such jobs
7b9f198 Fixed the error where the waiting for sync campaign was not being set to inactive after receiving the first card.
```

## Files to inspect first

```text
apps/web/src/server/api/card/recipients.ts
packages/db/repositories/company/companyRepo.ts
packages/db/repositories/campaign/campaignRepo.ts
packages/domain/company/Company.ts
packages/domain/campaign/Campaign.ts
packages/db/withLockRetry.ts
apps/web/src/tests/performance/concurrent_credits_flow.ts
apps/web/src/tests/performance/concurrent_credits_purchase_flow.ts
apps/web/src/tests/performance/create_cards_for_campaign.ts
apps/web/src/tests/performance/run_k6_with_seed.ts
docs/credits-system.md
docs/k6-load-test.md
```

## Important final implementation details

In `7b9f198`, `recipients.save` has the important accounting shape:

- non-charge cards are saved as `uncharged`,
- campaign credits are updated through `mutateCampaignOnNewCard(...)`,
- chargeable cards use `reserveCreditsForNewCardAtomic(...)`,
- campaign credit effects are applied as deltas,
- the app no longer writes stale absolute company/campaign credit values for this hot path.
