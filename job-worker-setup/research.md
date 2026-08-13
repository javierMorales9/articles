# Job Worker Setup Research

## Series State

- Series folder: `job-worker-setup`.
- Snapshot: `ref` is a symlink to `/home/javi/work/manuscritten-wt/work`.
- Snapshot branch: `staging`.
- Snapshot HEAD: `fd43c2be4bf742c70f0554db75a7ea13333a23a7`.
- `commits.md` currently exists but is empty. The implementation notes below are grounded in the current snapshot and nearby git history, not in an agreed commit range yet.

## User-Provided Story Context

Manuscritten originally lived mostly inside a Next.js app: frontend and backend together. That worked well while backend requests were small database operations.

The pressure came from long-running features. One concrete case was CSV campaign import. Customers uploaded recipient addresses for handwritten-letter campaigns, and the system validated those addresses with Google Maps Address Validation API to improve deliverability. This was fine for CSVs with roughly 100-200 letters, but some customers later wanted 600, 1000, or 2000 letters in one campaign.

Google's address validation API is called per address. There is no batch job in the implementation. That means a campaign import can become hundreds or thousands of external HTTP calls. At that point, keeping the work inside a Vercel/Next.js request becomes the wrong execution model.

External product facts to verify before final prose:

- Vercel's default and maximum function duration by plan/runtime.
- Whether the article should say "12 seconds by default" as the author's historical setup, rather than as a current universal Vercel limit.

## High-Level Implementation Shape

The current codebase is a Node/TypeScript monorepo:

- `apps/web`: Next.js web app and tRPC backend.
- `apps/worker`: standalone Graphile Worker process.
- `packages/db`: Drizzle schema, database connection, migrations, repositories, Graphile enqueue adapter.
- `packages/domain`: domain entities and business logic, including `Campaign`, `Card`, address validation, and `Job`.
- `packages/env`: shared web/domain environment validation, including `GOOGLE_MAPS_API_KEY` and `SKIP_ADDRESS_VALIDATION`.
- `packages/logger`: structured logging, wide events, provider failures, and event collectors.

The root `package.json` declares npm workspaces with `apps/*` and `packages/*`. It also exposes separate scripts:

- `npm run dev:web`
- `npm run dev:worker`
- `npm run build:web`
- `npm run build:worker`
- `npm run start:web`
- `npm run start:worker`
- `npm run typecheck`
- `npm run db:generate`
- `npm run db:apply`

The TypeScript base config maps internal package imports such as `@manus/db`, `@manus/domain`, `@manus/env`, and `@manus/logger`. The worker uses those package imports directly, which is the main reason the monorepo matters for the article: the worker can reuse the existing domain model, repositories, environment parsing, and logging instead of becoming a second isolated backend.

## Historical Commit Trail

Because `commits.md` is empty, this is a candidate trail from git history rather than the official range:

- `a3f668b7` - moved the backoffice app into a monorepo structure.
- `6155512f` - made the monorepo work and updated package boundaries.
- `45567272` - added job-supporting fields: campaign validation state, card validation state, and post-sent processing fields.
- `0f3393d1` - created the `Job` table/entity, added job creation in validation and finish-campaign paths, and implemented the validating-cards view after CSV upload.
- `d9ca6cc2` - created the base worker project.
- `2748cd1a` - created the worker with two use cases.
- Later commits moved execution from the custom `job` table path toward Graphile Worker and added Graphile migrations, job keys, Docker build fixes, OpenTelemetry, provider-failure monitoring, and validation progress UI fixes.

Potentially relevant later commits:

- `4130ecd8` - runs Graphile migrations inside the normal migration function.
- `6aa2aab1` - adds `jobKey` to jobs so tests/endpoints can retrieve enqueued jobs.
- `f7184d6a` - fixes one-time card validation banner progress.
- `d23637ce`, `5300f650`, `baaf664a` - add OpenTelemetry and worker job event logging.
- `8decd500`, `59787c42` - provider-failure monitoring and repository-level DB monitoring.
- `e2d1cdaa` - fixes circular dependency between `Card`, `Company`, and event emission that prevented the worker from running.

Editorial decision: do not explain the custom `job` table path in the article series. It existed historically, but the series should focus on the current Graphile Worker path.

## CSV Import And Job Enqueue Flow

The CSV upload UI lives in `apps/web/src/app/_components/CampaignEditor/CsvRecipientsForm.tsx`.

Observed flow:

1. The user uploads a CSV.
2. The UI maps CSV columns into Manuscritten card fields and campaign variables.
3. `addRecipients` filters out records missing required fields.
4. The UI calls the `saveCards` hook with:
   - `inputCards`
   - `campaignId`
   - `campaignVariables`
5. After the mutation, the UI revalidates the recipients tag and calls `afterUpload(result)`.

The backend mutation is in `apps/web/src/server/api/card/recipients.ts`, in `saveMultipleCards`.

Important behavior:

- It builds card entities from the submitted records.
- It calls `campaign.addVariables(input.campaignVariables)`.
- It calls `campaign.startCardsValidation()`, which sets `validatingCards = true`.
- It records received-card tracking dates with `campaign.markCardsReceived(...)`.
- Inside a single DB transaction:
  - it saves all cards and variables;
  - it saves the campaign without touching credits;
  - it saves tracking fields;
  - it creates a `Job` of type `JobType.VALIDATE_CARDS`;
  - it enqueues that job through `GraphileJobEnqueuer`.
- It returns `assignedCredits`, `invalidCards`, and, in test mode, `jobKey`.

This is the core request/worker split: the HTTP request persists the input and enqueues the asynchronous work, but it does not call Google for every address before responding.

## Graphile Worker Setup

The worker entrypoint is `apps/worker/src/index.ts`.

Startup sequence:

1. Set `process.title = "manus-worker"`.
2. Start worker OpenTelemetry.
3. Start the pending-jobs metrics sampler.
4. Register graceful shutdown handlers.
5. Start Graphile Worker.

`apps/worker/src/graphile.ts` starts Graphile Worker with:

- `connectionString: env.DATABASE_URL`
- `concurrency: env.WORKER_CONCURRENCY`
- `pollInterval: env.WORKER_POLL_INTERVAL_MS`
- `noPreparedStatements: false`
- task map from `apps/worker/src/tasks/index.ts`

Before starting Graphile, the worker calls `runMigrations(env.DATABASE_URL)`. That function runs both Drizzle migrations and Graphile Worker migrations. This matters because the worker can bootstrap the `graphile_worker` schema/tables in the same Postgres database the web app already uses.

There is one cron item:

- task: `daily_pending_report`
- schedule: `0 9 * * *`
- job key: `daily_pending_report`
- payload source: `cron.daily_pending_report`

Worker environment variables are parsed in `apps/worker/src/env.ts`:

- `DATABASE_URL`
- `WORKER_CONCURRENCY` default `5`
- `WORKER_POLL_INTERVAL_MS` default `1000`
- `WORKER_CHUNK_SIZE` default `50`
- `WORKER_RL_DELAY_S` default `30`
- Slack/reporting and OpenTelemetry variables
- `OBS_PENDING_JOBS_POLL_INTERVAL_MS`
- `OBS_WORKER_BATCH_DEBUG_EVENTS`

## Job Model And Graphile Payload

The domain job lives in `packages/domain/shared/Job.ts`.

Current job types:

- `validate_cards`
- `post_sent`
- `card_created_side_effects`
- `daily_pending_report`

Current job statuses:

- `pending`
- `running`
- `completed`
- `completed_with_errors`
- `failed`

`Job.new(...)` creates a job with:

- a UUID;
- a generated `jobKey`, unless one is explicitly provided;
- company/campaign ids;
- total/done/ok/failed/skipped counters;
- arbitrary payload.

`Job.toGraphilePayload()` serializes the domain job into the payload Graphile stores:

- `jobId`
- `jobKey`
- `type`
- `companyId`
- `campaignId`
- `total`
- `payload`

`Job.fromGraphilePayload(...)` reconstructs a domain `Job` from Graphile payload data and validates basic shape.

`GraphileJobEnqueuer` lives in `packages/db/repositories/shared/GraphileJobEnqueuer.ts` and implements the domain `JobEnqueuer` interface.

It enqueues jobs by calling:

```sql
select graphile_worker.add_job(
  task_identifier,
  payload,
  queue_name,
  run_at,
  max_attempts,
  job_key,
  priority,
  flags
)
```

In this codebase:

- task identifier is `job.type`;
- payload is `job.toGraphilePayload()`;
- `run_at` can come from options;
- `job_key` is `opts.jobKey`, `job.jobKey`, or `job.id`.

The adapter can also read job payload/meta by key from `graphile_worker._private_jobs` and `graphile_worker.jobs`.

## Out Of Scope: Custom Job Table

The repository still contains an older custom `job` table and `PostgresJobCreator` path, but the user explicitly decided not to discuss it in this series.

When drafting, ignore that implementation path unless it becomes necessary as a private research note. The public explanation should stay on:

- `GraphileJobEnqueuer`;
- `graphile_worker.add_job`;
- `apps/worker`;
- Graphile task handlers;
- campaign/card validation state for progress.

## Validate Cards Task

The Graphile task map lives in `apps/worker/src/tasks/index.ts`.

Each task:

1. normalizes the Graphile payload;
2. wraps execution in `observeJobRun`;
3. converts the payload back into a domain `Job`;
4. calls the specific task function.

`validate_cards` calls `validateCardsTask` from `apps/worker/src/tasks/validateCards.ts`.

The validation task:

- parses the job payload with zod;
- requires `campaignId`;
- loads repositories for campaign, card, card design, envelope design, and company;
- exits gracefully if campaign/design/company data is missing;
- fetches cards to validate in chunks via `cardRepo.getCardsToValidate(campaignId, env.WORKER_CHUNK_SIZE, lastProcessedId)`;
- validates each card address with `validateCardAddressWithGoogle`;
- marks each card as validated and recalculates price/credits through `card.markAsValidated(...)`;
- persists card and campaign credit changes in a DB transaction;
- uses `withLockRetry` around the transaction;
- tracks `processedCards` and `definitiveErrors`;
- after processing, counts remaining unvalidated cards;
- if none remain, calls `campaign.finishValidation()` and saves the campaign without touching credits;
- if cards remain without an error, throws;
- if an error happened, leaves pending cards and logs the state.

This task is the concrete long-running unit for the article. It has all the properties that make it a bad HTTP request:

- it loops over a potentially large number of cards;
- it makes an external Google API call per card;
- it performs transactional writes;
- it must survive partial progress and errors;
- it needs progress visibility in the UI.

## Google Address Validation

The address validation logic lives in `packages/domain/card/validateAddressWithGoogle.ts`.

Important functions:

- `validateInputAddress(...)`
- `validateCardAddressWithGoogle(...)`
- `validateSenderAddressWithGoogle(...)`
- internal `makePetition(...)`

The function calls:

```text
https://addressvalidation.googleapis.com/v1:validateAddress?key=GOOGLE_MAPS_API_KEY
```

with a JSON body containing address lines:

- address
- zip
- city
- province

If `SKIP_ADDRESS_VALIDATION` is enabled, it returns the input or skips validation. This is useful for tests and performance/load scenarios.

The validation result updates the domain object:

- address
- province
- zip
- country
- city

The implementation treats `possibleNextAction !== "ACCEPT"` as not found, and also rejects results with unconfirmed country, administrative area, or postal code. Unsupported region errors are treated specially by extracting a country code if possible.

## UI Progress And UX

The campaign editor reads `validatingCards` from campaign state.

In `UserCampaignEditor.tsx`:

- campaign data refetches every 2 seconds while local or remote `validatingCards` is true;
- when validation transitions from true to false, the UI refetches cards, campaign, validation progress, and company data;
- the recipients view is replaced with a validation-progress state while validation runs.

The validation progress query is in `apps/web/src/server/api/card/recipients.ts`:

- it calls `cardRepo.getValidationStats(campaignId)`;
- computes `pendingCards = totalCards - validatedCards`;
- computes `validationProgress = floor(validatedCards / totalCards * 100)`;
- returns total, validated, pending, and percent.

The user-facing text currently says, in Spanish, roughly:

- "Validando direcciones..."
- "X de Y cartas validadas (Z%)."

This is an article-worthy UX detail: moving work to a worker still needs a product state. The user should see that the import was accepted and that the system is doing the slow part somewhere else.

## Database And Migration Notes

Relevant migrations:

- `0060_add_a_validating_field_to_campaigns.sql` adds `campaign.validating_cards`.
- `0061_add_a_validated_field_to_cards.sql` makes `campaign.validating_cards` default false/not null and adds `card.validated`.
- `0062_add_a_processed_post_sent_field_to_cars.sql` adds post-sent processing support.
- `0063_created_jobs_table.sql` creates the custom `job` table.

Graphile Worker migrations are not represented as Drizzle SQL files. They are run by `runGraphileWorkerMigrations` from the `graphile-worker` package inside `packages/db/testFunctions.ts`.

`packages/db/resetDb.ts` truncates `graphile_worker._private_jobs` if the Graphile table exists, which confirms that tests/dev DB reset knows about Graphile Worker's internal tables.

## Observability

The worker has a proper observability layer rather than relying only on console logs.

`observeJobRun`:

- creates an OpenTelemetry consumer span named `worker.job.<type>`;
- attaches job/company/campaign identifiers;
- extracts parent trace context from job payload if present;
- builds a `worker.job.completed` wide event;
- records duration and error metrics;
- emits structured log/event data through `@manus/logger`;
- records exceptions on failure and rethrows.

The web side includes job context in the payload with `buildJobObsContext(ctx)` before enqueueing. This lets a worker job remain connected to the original request/session trace.

Later provider-failure work added:

- Google address validation provider failure events;
- repository-level DB monitoring through `BaseRepository.withDbMonitoring`;
- broader provider failure monitoring for S3, Slack, Segment, Stripe, HubSpot.

This could become a later article section or a separate post: once work moves out of the request, debugging moves too. You need enough job identity, provider failure context, and trace propagation to know what happened.

## Tests And Verification Signals

Integration tests reference `GraphileJobEnqueuer` in many server test files. The most relevant one for this series is `apps/web/src/tests/integration/server/saveMultipleCards.test.ts`, which asserts that saving multiple cards:

- marks the campaign as validating;
- enqueues a `VALIDATE_CARDS` job;
- returns/uses a job key in test context.

`validationProgress.test.ts` covers progress calculation.

Recent test-harness commits are not directly about the worker feature but may matter if the series discusses how painful integration tests became after the monorepo/worker split:

- one Postgres container shared across workers reduced test time from roughly 46s/run to 11s/run;
- a template database reduced migration overhead further.

## Article Angles

Possible series structure based on the implementation:

1. Why the Next.js request stopped being the right execution model.
   - Start from CSV imports and Google address validation.
   - Explain why 100 cards felt fine and 2000 cards changed the shape of the problem.
   - Show the desired request boundary: persist input, enqueue job, return.

2. Moving from one app to a monorepo.
   - Explain why the worker cannot be a copy-paste backend.
   - Show `apps/web`, `apps/worker`, and `packages/*`.
   - Explain shared domain, DB, env, and logger packages.

3. Creating the worker with Graphile Worker and Postgres.
   - Show `GraphileJobEnqueuer`, `graphile_worker.add_job`, task map, and `validateCardsTask`.
   - Explain why Postgres was enough: the app already had it, Graphile stores jobs there, and the worker process can run independently.

4. Making asynchronous work visible and debuggable.
   - Campaign `validatingCards`.
   - Card `validated`.
   - Progress polling.
   - `jobKey`.
   - OpenTelemetry/wide events/provider failures.

Editorial decision after discussion: keep this as a 3-post series and include observability as the closing layer of the Graphile Worker post, not as a separate post for now.

## Risks Or Gaps To Resolve

- `commits.md` needs the official commit range. The current research uses a candidate historical trail.
- Do not include the custom `job` table in the public series.
- Verify Vercel runtime-limit statements against official docs before final prose.
- Decide how much of the later observability work belongs in this worker setup series versus a separate series.
- Decide whether to include deployment details such as `apps/worker/Dockerfile`, staging/production `NODE_ENV` fixes, and `.env.worker`.
