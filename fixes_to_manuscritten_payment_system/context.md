# Manuscritten credit system fixes — article series

This series documents how we fixed race conditions in Manuscritten's credit system when a customer generated large batches of letters through automatic campaigns. Incoming API requests could arrive in the same second (e.g., 1,000 letters), and concurrent deductions caused inconsistent balances.

Planned articles (one per step):
- Introduction: what Manuscritten is, how we discovered the issue, and how the API worked before the fixes.
- Reproduce the race with k6 tests.
- Evaluate and choose a Postgres locking strategy.
- Implement the fix in the codebase.
- Monitor the database to validate behavior.
- Add retry mechanisms for lock acquisition.
- Run the tests in CI.

## Automated campaign API card creation (baseline vs post-fix)

Source files reviewed:
- `ref/apps/web/src/app/api/public/card/route.ts`
- `ref/apps/web/src/server/api/card/recipients.ts` (`save`)
- `ref/packages/db/repositories/card/cardRepository.ts` (`saveCard`)
- `ref/packages/db/repositories/campaign/campaignRepo.ts` (`findForUpdate`, `save`)
- `ref/packages/db/repositories/company/companyRepo.ts` (`findForUpdate`, `saveCompany`)

Shared entry point:
- Public endpoint `POST /api/public/card` parses JSON, normalizes `variables` into `{name,value}[]`, logs and forwards to `api.card.recipients.save`.

Pre-fix (before commit 923471e):
- `recipients.save`:
  - Loads campaign and required designs; rejects if campaign not active for adding cards.
  - Loads company.
  - Validates and normalizes address input.
  - Builds a `Card` domain object, runs Google address validation (non-blocking on error).
  - Mutates domain objects in memory (adds campaign variables, charges company credits) before any locks.
  - Saves card + campaign + company inside a transaction, but without row-level locks or retries.
  - Returns `card.id` and emits analytics/hooks after the transaction.

Post-fix (after commit 923471e and later):
- `recipients.save`:
  - Same pre-validation and card construction steps.
  - Wraps credit mutations in `withLockRetry(...)` and a transaction.
  - Acquires row-level locks in a fixed order: company first, then campaign (`SELECT ... FOR UPDATE`).
  - Re-validates campaign status/designs under the lock to avoid mid-flight changes.
  - Charges credits and persists card + campaign + company within the locked transaction.
  - Returns `card.id` and emits analytics/hooks after the transaction.
