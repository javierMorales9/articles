# Research: Integration Tests in Manuscritten

## Series Preparation

This series is based on the current `ref/` snapshot at `fd43c2be`, with post 2 focused on the integration-test performance commits listed in `commits.md`.

Primary files inspected:

- `apps/web/src/tests/integration/server/`
- `apps/web/src/tests/utils/TestContext.ts`
- `apps/web/src/tests/utils/serverIntGlobalSetup.ts`
- `apps/web/src/tests/utils/serverIntGlobalTeardown.ts`
- `apps/web/jest.config.ts`
- `apps/web/jest.server.setup.ts`
- `packages/db/testFunctions.ts`
- `packages/db/resetDb.ts`
- representative API and repository code involved in the tests

Post 2 performance arc:

- Baseline described by the earlier research: one PostgreSQL container per integration test file, with migrations paid repeatedly and `resetDatabase` truncating public tables before each test.
- First major optimization: use Jest `globalSetup`/`globalTeardown` to start one PostgreSQL container for the whole `server-int` project, then create one database per Jest worker inside that container.
- Second major optimization: stop truncating the whole database between tests by making each test create fresh company-scoped fixtures.
- Third major optimization: create and migrate a template database once, then create each worker database with `CREATE DATABASE ... TEMPLATE ...`.
- Final cleanup: remove timing logs, fallback code paths, and per-context container ownership from the harness.
- Experiments tried and reverted:
  - keeping/reusing the container and template database across separate test runs;
  - replacing `next/jest` project selection with a dedicated inline Jest config.

## High-Level Testing Shape

The integration tests live under `apps/web/src/tests/integration/server/`.

They test server-side tRPC procedures directly through `createCaller`, not through an HTTP server. This keeps the tests close to application behavior while avoiding the overhead of booting the whole Next.js runtime.

The core test stack is:

- Jest as the runner.
- `next/jest` to load the Next.js testing configuration.
- `@testcontainers/postgresql` to start real PostgreSQL containers.
- Drizzle for database access.
- Drizzle migrations plus Graphile Worker migrations.
- Real repositories against the test database.
- Domain mothers to create valid aggregate fixtures.
- Targeted mocks only for process boundaries such as env values, logging, and external address validation.

The tests are not pure end-to-end tests. They do not drive the browser and they do not generally send HTTP requests. They are server integration tests: API procedure plus domain logic plus repositories plus PostgreSQL.

## Jest Configuration

`apps/web/jest.config.ts` defines three Jest projects:

- `client`: jsdom tests for `src/tests/unit/client/` and `src/tests/integration/client/`.
- `server-unit`: node tests for `src/tests/unit/server/`.
- `server-int`: node tests for `src/tests/integration/server/`.

The server integration project:

- uses `testEnvironment: "node"`;
- matches `src/tests/integration/server/**/*.+(test|spec).[jt]s?(x)`;
- loads `jest.server.setup.ts` through `setupFilesAfterEnv`;
- uses the same Babel/Next transform as the other projects;
- maps `@/` to `src/`.

Relevant scripts from `apps/web/package.json`:

- `npm run test`: runs all Jest projects.
- `npm run test:client`: runs only the client project.
- `npm run test:server-unit`: runs only server unit tests.
- `npm run test:server-int`: runs only server integration tests.

At the root package level, `npm run test:web` delegates to the web workspace test command.

## Server Jest Setup

`apps/web/jest.server.setup.ts` performs the test-wide server setup.

It sets a large timeout:

- `jest.setTimeout(500 * 1000)`

This matters because PostgreSQL containers and migrations can be slow, especially on the first run.

It mocks `server-only` with an empty module so server-only imports do not break in Jest.

It mocks logging through `@/withLogContext` with a no-op logger implementing:

- `with`
- `info`
- `error`
- `debug`
- `warn`

It mocks both `@manus/env` and `@/env` with test-safe environment values:

- fake database URL placeholder;
- test Clerk keys;
- test Stripe keys;
- `NODE_ENV: "test"`;
- `SKIP_ADDRESS_VALIDATION: true`.

It mocks Google address validation at the domain boundary:

- `@manus/domain/card/validateAddressWithGoogle`
- default `validateInputAddress` returns `{ error: null, ...rec }`

Some individual test files override that address validation mock when they need to assert failed validation or call counts.

## TestContext

`apps/web/src/tests/utils/TestContext.ts` is the central helper for integration tests.

`createTestContext(company?: Company)`:

1. Reads shared server integration state from a JSON file in the OS temp directory.
2. Uses `JEST_WORKER_ID` to derive a worker database name such as `manus_test_worker_1`.
3. Creates that worker database inside the already-running PostgreSQL container if it does not exist.
4. Creates the worker database from the migrated template database.
5. Stores worker readiness and URL in process env vars so the same worker can reuse its database connection URI.
6. Assigns `process.env.DATABASE_URL` to the worker database URI.
7. Calls `jest.resetModules()`.
8. Creates a Drizzle database instance.
9. Creates a tRPC caller using `createCaller`.
10. Returns a `TestContext` containing the db, api caller, and optional default company.

The created tRPC context includes:

- `db`;
- `actorCompany`;
- `targetCompany`;
- `company`;
- `actorIsAdmin`;
- `actingAs`;
- `accessScope`;
- headers;
- request/session metadata;
- no-op logger;
- `eventCollector: null`;
- `contextError: null`.

`TestContext.authenticatedWith(company)` rebuilds the API caller with a different authenticated company. This lets tests switch between normal-company and admin-company behavior without rebuilding the container.

`TestContext.teardown()` closes the Drizzle/postgres client. It no longer owns or stops a PostgreSQL container; the container lifecycle belongs to Jest `globalSetup` and `globalTeardown`.

Each integration test file generally follows this shape:

```ts
let context: TestContext;

beforeAll(async () => {
  context = await createTestContext(workingCompany);
}, 50_000);

afterAll(async () => {
  await context.teardown();
});

beforeEach(async () => {
  resetFixtures();
  context.authenticatedWith(workingCompany);
});
```

Most files also register `SIGINT` and `SIGTERM` handlers that call `context.teardown()` before process exit.

## Database Creation And Migrations

`packages/db/testFunctions.ts` provides the database test helpers.

`runMigrations(url)`:

- creates a postgres-js connection;
- creates a Drizzle db object;
- resolves the migrations folder by walking up from `process.cwd()`;
- creates the `drizzle` schema if needed;
- runs Drizzle migrations;
- runs Graphile Worker migrations;
- closes the connection in `finally`.

Graphile Worker matters because some endpoint behavior enqueues jobs and the tests assert that those jobs exist in Graphile tables.

`createDb(url)` creates a Drizzle database instance from the connection string and the project schema.

`apps/web/src/tests/utils/serverIntGlobalSetup.ts` now performs the expensive database setup once for the whole server integration Jest project:

1. Start a single PostgreSQL container from `postgres:16-alpine`.
2. Create the normal `manus_test` database with user/password `manus`/`manus`.
3. Create a `manus_test_template` database inside the same container.
4. Run Drizzle and Graphile Worker migrations against the template database.
5. Lock the template database with `ALTER DATABASE ... WITH ALLOW_CONNECTIONS false`.
6. Write the container connection URI and template database name into the temp state file.

Each worker database is then created with:

```sql
CREATE DATABASE "manus_test_worker_N" TEMPLATE "manus_test_template";
```

The article can frame this as moving migration cost out of each worker/test-file path. Migrations still run against a real PostgreSQL database, but only once per integration test run.

## Reset Strategy

`packages/db/resetDb.ts` defines `resetDatabase(db)`.

It executes a PostgreSQL block that:

- collects all tables in the `public` schema;
- runs `TRUNCATE TABLE ... RESTART IDENTITY CASCADE`;
- lowers client notices to warnings while doing this.

This remains available as a helper, but the optimized integration tests no longer use it as the default per-test isolation mechanism.

The old pattern was:

- one container per test file/suite;
- migrations once in each file's `beforeAll`;
- truncate all public tables before each test.

The new pattern is:

- one PostgreSQL container for the server integration Jest project;
- one database per Jest worker inside that container;
- one migrated template database copied into worker databases;
- no database-wide truncate in normal `beforeEach` hooks;
- per-test fixture regeneration, especially fresh companies.

The important domain trick is company scoping. Most Manuscritten server endpoints operate relative to the authenticated company. Campaigns, cards, senders, billing state, and authorization checks are normally filtered by company ownership. If each test creates a fresh company and authenticates as that company, stale rows from previous tests can remain in the worker database without affecting the current test's endpoint behavior.

This is not a universal reset strategy. It works here because company ownership is a strong namespace for most behaviors under test. Tests that use global uniqueness, admin-wide queries, Graphile job tables, or state not scoped by company still need extra care.

## What Is Real And What Is Mocked

Real in the integration tests:

- PostgreSQL;
- schema migrations;
- Graphile Worker schema;
- Drizzle queries;
- repository save/find/update/delete behavior;
- tRPC procedure code;
- domain entities and domain mothers;
- transaction behavior;
- SQL-level aggregations and table relationships;
- authorization scope middleware at the tRPC layer.

Mocked:

- environment variables;
- logging;
- `server-only`;
- Google address validation;
- occasionally specific address validation functions per test.

This boundary is important for the articles: the tests are not trying to make everything real. They include the database because the database is part of the behavior being verified, but they still mock external services that are not the subject of the test.

## Representative Test Areas

The integration suite covers many server behaviors:

- company billing credit updates;
- pricing settings;
- campaign creation;
- campaign activation;
- campaign deletion;
- card creation;
- multiple-card creation;
- card deletion;
- card address updates;
- campaign save/edit behavior;
- campaign work/finish flows;
- sender endpoints;
- validation progress;
- basic tRPC tooling.

Files include:

- `saveCard.test.ts`
- `deleteCards.test.ts`
- `activateCampaign.test.ts`
- `deleteCampaign.test.ts`
- `finishCampaign.test.ts`
- `saveMultipleCards.test.ts`
- `createAutomaticSingle.test.ts`
- `createDefaultSingle.test.ts`
- `createDefault.test.ts`
- `updateAvailableCredits.test.ts`
- `updateDueCredits.test.ts`
- `createAdminPurchase.test.ts`
- `validationProgress.test.ts`
- `senders.test.ts`

## Examples Where Integration Tests Matter

### Credit Mutations Across Multiple Tables

`saveCard.test.ts` exercises `context.api.card.recipients.save`.

The procedure:

- loads campaign, company, card design, and envelope design through repositories;
- validates the input address;
- creates a domain `Card`;
- decides whether the card should be charged;
- runs transactional writes;
- mutates campaign assigned/due credits;
- mutates company available/due credits;
- persists the card;
- enqueues a Graphile job;
- returns a job key in test mode.

The assertions inspect persisted state through repositories:

- saved card fields;
- card price;
- payment status;
- company available credits;
- company due credits;
- campaign state;
- campaign assigned credits;
- campaign due credits;
- tracking dates;
- Graphile job payload.

This is a strong example for the first article: mocking the repository would remove much of the behavior under test. A fake repository could confirm that a method was called, but it would not verify that several persisted tables, transactional operations, and job rows end up consistent.

### Owed Credits And Compensation

Several tests model cases where companies do not have enough available credits.

In `saveCard.test.ts`, a company with 2 available credits receives a 3-credit card:

- the saved card becomes `PaymentStatus.OWED`;
- company available credits remain 2;
- company due credits become 3;
- campaign assigned credits remain 0;
- campaign due credits become 3;
- the Graphile job records `owedTransitionedNow: true`.

Another test starts with the company already owing credits and asserts that the job does not mark a new owed transition.

These cases are useful article material because they involve state transitions that span domain decisions, persisted balances, campaign bookkeeping, and job payloads.

### Deleting Cards And Recomputing Balances

`deleteCards.test.ts` covers deletion of cards from automated campaigns.

The procedure being tested:

- finds the cards;
- finds the company and campaign;
- locks company and campaign rows with `findForUpdate`;
- computes deletion credit summaries from persisted cards;
- deletes selected cards;
- recomputes campaign dates;
- saves campaign credit fields;
- may compensate owed credits across company campaigns;
- may charge owed cards after compensation;
- saves company credit fields.

The tests assert:

- remaining card count;
- recalculated assigned credits;
- recalculated due credits;
- company available/due credits;
- first/last card tracking dates.

This is a good example of logic that is awkward and weak to test with mocks because the interesting behavior depends on the actual persisted set of cards and aggregate SQL queries.

### Validation Progress

`validationProgress.test.ts` tests `context.api.card.recipients.validationProgress`.

The endpoint calculates:

- total cards;
- validated cards;
- pending cards;
- validation progress percentage.

The test creates cards through the real API, then uses Drizzle to mark two persisted card rows as `validated: true`. The endpoint then reads validation stats from the real database.

This is a compact example where database state is the source of truth. The point is not a complex domain method; the point is that the query must count real rows correctly.

### Authorization And Company Scoping

Many tests assert company scoping and admin behavior:

- admin companies can update another company's credits;
- normal companies cannot update their own billing credits through admin endpoints;
- a campaign from another company returns "Not found";
- non-admin companies cannot create cards or campaigns on behalf of another company;
- `TestContext.authenticatedWith(company)` switches the caller context.

This matters because the scope is enforced through tRPC middleware and context construction, not only through domain methods.

Integration tests verify that the caller, middleware, procedure, repository queries, and persisted company IDs line up.

### Graphile Jobs

Several tests verify job creation through `GraphileJobEnqueuer`.

`GraphileJobEnqueuer.enqueue` calls:

```sql
SELECT graphile_worker.add_job(...)
```

`getJobByKey` reads from `graphile_worker._private_jobs`.

The integration tests can assert real job payloads after endpoint execution because Graphile Worker migrations run in the test database.

This is another case where a mock would only prove that a function was called. The integration test proves that the job was inserted in the same database transaction path used by production.

## Test Data Pattern

The tests use domain mothers extensively:

- `CompanyMother`
- `CampaignMother`
- `SenderMother`
- `CardDesignMother`
- `EnvelopeDesignMother`
- `RecipientMother`

These mothers produce valid domain objects with realistic defaults. Tests then override the relevant attributes:

- company credits;
- admin vs normal company archetypes;
- campaign archetypes such as `AUTOMATED_ACTIVE`, `ONE_TIME_DRAFT`, `AUTOMATED_WAITING_FOR_SYNC`;
- card design and envelope design archetypes;
- recipient country/person/company combinations.

This keeps setup readable while still using real repositories and persisted records.

## Current Parallelization And Container Tradeoff

Current implementation starts one PostgreSQL container for the whole server integration Jest project, not one per test file.

The old implementation was simple but expensive:

- each integration test file called `createTestContext` in `beforeAll`;
- `createTestContext` started a new `postgres:16-alpine` container;
- each file paid the migration cost;
- each test truncated public tables before running;
- many files meant many Docker containers.

The optimized implementation keeps the real-database guarantee but changes the isolation boundary:

- Jest `globalSetup` starts one shared PostgreSQL container;
- `globalSetup` creates and migrates `manus_test_template`;
- each Jest worker gets its own database inside that container;
- worker databases are copied from the migrated template database;
- tests isolate normal product data by creating fresh company-scoped fixtures;
- `globalTeardown` stops the shared container and removes the temp state file.

The root `test:int` command runs the server integration project with `--maxWorkers=8`, so the intended scaling shape is up to eight worker databases inside one PostgreSQL container.

Advantages:

- Docker startup is paid once per test run;
- migration cost is paid once against the template database;
- workers can run in parallel without sharing the same database;
- tests avoid expensive whole-database truncation in the common case;
- the setup still uses real PostgreSQL, real migrations, real Drizzle queries, and real Graphile tables.

Costs and caveats:

- Docker is still required;
- the harness is more complex than one container per file;
- database names and temp state must be coordinated across Jest processes;
- worker database creation needs an advisory lock to avoid concurrent `CREATE DATABASE` races;
- company-scoped isolation depends on the product's data model and cannot be blindly copied to every application;
- tests that assert global behavior must still avoid hidden coupling with data left by previous tests.

The measured story from the commits is:

- one-container-per-file baseline: about 46 seconds per run;
- one shared container with worker databases: about 11 seconds per run;
- later optimizations, especially template database creation and avoiding per-test truncation, brought the run down to about 6 seconds.

Two experiments are useful negative research:

- Reusing the container/template database across separate test runs with Testcontainers reuse and migration hashing was implemented, then reverted because it did not improve enough to justify the extra machinery.
- Creating a dedicated `jest.server-int.config.ts` and bypassing `next/jest` was implemented, then reverted because it did not materially improve runtime.

## Article 1 Technical Angle

The first article can use a deliberately simple hexagonal architecture example:

- controller/use case changes a company name;
- domain entity stores business rules;
- repository is an interface;
- concrete repository stores and loads full domain entities;
- unit test injects an in-memory repository implementation.

That example is true and useful for simple endpoints where the behavior lives in the domain object.

The contrast should come when real behavior depends on:

- SQL aggregations;
- transactions;
- row locks;
- foreign keys and cascades;
- persisted derived state;
- job tables;
- authorization scope plus stored ownership;
- migrations and schema constraints.

Manuscritten examples that support this contrast:

- card creation updates card, campaign, company, and job state;
- card deletion recomputes credits and dates from remaining persisted cards;
- validation progress counts persisted rows;
- admin/company scoping depends on context and persisted company ownership;
- Graphile job enqueueing uses database functions and Graphile tables.

The conclusion for article 1 should not be "integration tests are always better." It should be narrower:

When the database is part of the behavior, excluding it from the test often removes the part we most need confidence in.

## Article 2 Technical Angle

The second article can explain the Manuscritten setup:

- Jest project separation between client, server unit, and server integration tests.
- Testcontainers PostgreSQL setup.
- Running Drizzle and Graphile migrations inside the container.
- Creating a migrated template database once per run.
- Creating one worker database per Jest worker with `CREATE DATABASE ... TEMPLATE ...`.
- Building a tRPC caller directly with test context.
- Using real repositories against the test database.
- Avoiding per-test `TRUNCATE` by regenerating company-scoped fixtures.
- Mocking external boundaries while keeping database behavior real.
- Switching authenticated company context with `authenticatedWith`.
- Tradeoffs around container count, test speed, and parallelism.

The article should use the optimization as the concrete narrative:

- start with the working-but-slow version;
- identify the actual cost centers: Docker containers, migrations, cleanup;
- show the three levers: one container, one DB per worker, company-scoped data isolation;
- mention the template database as the migration optimization;
- mention the reverted experiments as examples of measuring instead of guessing.

## Open Questions Before Drafting

- Does the user want the first article to use a fully fictional company-name controller example, or should it be lightly inspired by Manuscritten's company endpoints?
- Should article 1 include code snippets only as pseudocode, or should it include TypeScript-style snippets matching the Manuscritten stack?
- For article 2, should we include exact command snippets such as `npm run test:server-int` and selected helper code excerpts?
- Confirm the final runtime number to use in prose: the commit message records 46s to 11s for the first big optimization, while the user reports the final result as 46s to 6s after all three levers.
