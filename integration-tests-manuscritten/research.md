# Research: Integration Tests in Manuscritten

## Series Preparation

This series is based on the current `ref/` snapshot rather than a specific commit range.

Primary files inspected:

- `apps/web/src/tests/integration/server/`
- `apps/web/src/tests/utils/TestContext.ts`
- `apps/web/jest.config.ts`
- `apps/web/jest.server.setup.ts`
- `packages/db/testFunctions.ts`
- `packages/db/resetDb.ts`
- representative API and repository code involved in the tests

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

1. Starts a PostgreSQL container from `postgres:16-alpine`.
2. Creates database `manus_test`.
3. Uses username/password `manus`/`manus`.
4. Reads the runtime connection URI from the container.
5. Assigns `process.env.DATABASE_URL` to that URI.
6. Calls `jest.resetModules()`.
7. Runs database migrations.
8. Creates a Drizzle database instance.
9. Creates a tRPC caller using `createCaller`.
10. Returns a `TestContext` containing the container, db, api caller, and optional default company.

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

`TestContext.teardown()` stops the PostgreSQL container.

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
  await resetDatabase(context.db);
});
```

Most files also register `SIGINT` and `SIGTERM` handlers to stop the container before process exit.

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

## Reset Strategy

`packages/db/resetDb.ts` defines `resetDatabase(db)`.

It executes a PostgreSQL block that:

- collects all tables in the `public` schema;
- runs `TRUNCATE TABLE ... RESTART IDENTITY CASCADE`;
- lowers client notices to warnings while doing this.

This is a database-wide reset within the container. The current pattern is:

- one container per test file/suite;
- migrations once in `beforeAll`;
- truncate all public tables before each test.

This avoids starting a fresh container for every individual test while keeping tests isolated inside a suite.

Because each Jest test file creates its own container, parallel Jest workers can run different files without sharing a database. Within each file, tests share a container but reset data before each case.

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

Current implementation starts one PostgreSQL container per integration test file.

Advantages:

- strong isolation between files;
- natural compatibility with Jest workers;
- no accidental data sharing across files;
- no need to create per-worker schemas or databases;
- simple mental model.

Costs:

- if many test files run in parallel, many PostgreSQL containers may start;
- first-run migration cost is paid per file;
- Docker availability is required;
- local runs can be slower or heavier than unit tests.

The user specifically wants the second article to discuss avoiding "200 Docker containers." This snapshot currently shows the simple per-file-container pattern. The article should either:

- describe this as the current baseline and then propose/describe a later optimization, if implemented elsewhere; or
- inspect any newer implementation before writing final prose if the production branch has changed.

Potential optimization directions to verify before writing article 2:

- one container per Jest worker;
- one container for the whole integration project;
- one database/schema per worker;
- transactional rollback per test;
- company-level namespacing for tests that can safely share a database;
- explicit unique company IDs/external IDs to avoid cross-test collisions.

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
- Building a tRPC caller directly with test context.
- Using real repositories against the test database.
- Resetting state with `TRUNCATE ... RESTART IDENTITY CASCADE`.
- Mocking external boundaries while keeping database behavior real.
- Switching authenticated company context with `authenticatedWith`.
- Tradeoffs around container count, test speed, and parallelism.

The article should be careful to distinguish:

- currently observed implementation in this snapshot;
- recommendations or improvements that are not present in the snapshot.

## Open Questions Before Drafting

- Should article 2 describe the current one-container-per-file approach as the actual implementation, or has Manuscritten since moved to a shared-container/per-worker setup?
- Does the user want the first article to use a fully fictional company-name controller example, or should it be lightly inspired by Manuscritten's company endpoints?
- Should article 1 include code snippets only as pseudocode, or should it include TypeScript-style snippets matching the Manuscritten stack?
- For article 2, should we include exact command snippets such as `npm run test:server-int` and selected helper code excerpts?
