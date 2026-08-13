# Series: Integration Tests

## Summary

This two-part series explains how I think about integration tests, especially in applications that use a clean domain architecture but still depend on real database behavior for important parts of the product.

The first article makes the argument. It starts from the happy path for unit testing in a hexagonal architecture: a controller or use case depends on a repository interface, the domain owns the business rules, and tests can inject an in-memory repository. That structure is genuinely useful. Then the article turns to the cases where this stops being enough because the database is no longer a boring persistence detail. When behavior depends on transactions, SQL aggregation, row locks, persisted derived state, constraints, or background-job tables, mocking the database often removes the most important part of the system from the test.

The second article explains the concrete Manuscritten setup for server integration tests: Jest project separation, testcontainers, PostgreSQL, Drizzle and Graphile migrations, direct tRPC callers, database resets, company scoping, and the tradeoffs around parallelism and container count.

## Post 1: When Integration Tests Are Worth It

Working title: **When I Stopped Mocking the Database**

Purpose:

Explain when I personally find integration tests useful, and why they are not a replacement for unit tests but a different tool for a different kind of risk.

Core argument:

Hexagonal architecture is excellent for unit testing when the business behavior lives in the domain layer and the database is only a storage mechanism. In those cases, replacing the repository with an in-memory implementation gives fast, focused, readable tests.

But many real systems eventually place meaningful behavior at the database boundary. At that point, mocking the repository can produce tests that are pleasant but incomplete. The test may prove that the use case calls the expected methods, while skipping the actual transaction, query, constraint, lock, aggregation, or persisted state transition that makes the feature risky.

Planned structure:

1. Start with a small example: a controller/use case that changes a `Company` name.
2. Explain the layers:
   - controller or application service;
   - domain entity with business rules;
   - repository interface;
   - concrete repository as a persistence adapter that saves and loads whole domain objects.
3. Show why this is ideal for unit tests:
   - create an in-memory repository;
   - inject it into the controller/use case;
   - assert the company name changed;
   - no database needed.
4. Contrast that with real cases where the database is part of the behavior.
5. Use 4-5 examples inspired by Manuscritten:
   - credit mutations across company, campaign, card, and job state;
   - deleting cards and recomputing balances from persisted rows;
   - validation progress calculated from database counts;
   - authorization and company scoping based on persisted ownership;
   - Graphile jobs inserted and inspected through database tables.
6. Conclude that, for these cases, the useful test is often the one that includes the database.
7. Link to the second article, which explains how we implemented this in Manuscritten.

Tone:

First-person, practical, slightly opinionated. The article should avoid presenting integration tests as a religion. The point is narrower: when the database participates in the behavior, pretending it is not there can make tests less useful.

Intentional scope:

Do not dive deeply into Manuscritten's full testcontainers setup in this article. Mention enough real examples to make the argument concrete, then leave implementation details for post 2.

## Post 2: How We Test Manuscritten With a Real Database

Working title: **How We Built Database Integration Tests in Manuscritten**

Purpose:

Explain the concrete testing setup used for Manuscritten server integration tests.

Core argument:

The practical challenge is not only "use a real database." It is making real-database tests ergonomic enough that developers can run them without the suite becoming slow, flaky, or impossible to reason about.

Observed implementation in the current snapshot:

- Jest has separate projects for client tests, server unit tests, and server integration tests.
- Server integration tests run in Node.
- They live under `apps/web/src/tests/integration/server/`.
- They use `jest.server.setup.ts`.
- Jest `globalSetup` starts one PostgreSQL container with `@testcontainers/postgresql`.
- The container uses `postgres:16-alpine`.
- A migrated template database is created once per integration test run.
- Each Jest worker gets its own database copied from the template database.
- Migrations run against the template database:
  - Drizzle migrations;
  - Graphile Worker migrations.
- Tests call tRPC procedures directly with `createCaller`.
- Repositories use the real Drizzle database connection.
- Tests avoid per-test database truncation by creating fresh company-scoped fixtures.
- External services are mocked:
  - env;
  - logging;
  - Google address validation.
- The database and application persistence behavior remain real.
- The performance story is a move from roughly 46s to roughly 6s by removing container-per-file overhead, isolating by worker database, and leaning on company scoping instead of global cleanup.

Planned structure:

1. Explain the test shape: server integration tests, not browser E2E tests.
2. Show the Jest project split:
   - `client`;
   - `server-unit`;
   - `server-int`.
3. Explain `jest.server.setup.ts`:
   - timeout;
   - env mocks;
   - logger mock;
   - address validation mock.
4. Explain `TestContext`:
   - read shared container/template state from the temp file;
   - derive a database name from `JEST_WORKER_ID`;
   - create/reuse a worker database from the template;
   - set `DATABASE_URL`;
   - reset modules;
   - create Drizzle db;
   - build tRPC caller;
   - allow auth switching with `authenticatedWith`.
5. Explain why Graphile Worker migrations matter:
   - tests assert real job records;
   - job enqueueing uses database functions/tables.
6. Explain the optimization path:
   - old setup created one container per test file;
   - new setup creates one container for the Jest project;
   - each worker gets a separate database;
   - the template database avoids repeated migrations.
7. Explain company scoping and cleanup:
   - each test creates fresh companies;
   - most endpoints filter by authenticated company;
   - stale rows can coexist without affecting company-scoped behavior;
   - this is powerful but application-specific.
8. Discuss the tradeoff:
   - realistic behavior and high confidence;
   - slower than unit tests;
   - Docker required;
   - more harness complexity than one container per file;
   - global or non-company-scoped data still needs extra care.
9. Close with practical guidelines:
   - keep unit tests for pure domain behavior;
   - use integration tests where persistence behavior is part of the risk;
   - mock external APIs, not the database behavior being tested;
   - make setup helpers boring and centralized.

Open point before drafting:

Confirm the final runtime number to use in prose. The commit history records the first large improvement as 46s to 11s, while the final narrative target is 46s to 6s after all three levers.

## Suggested Drafting Order

1. Draft post 1 first, using the conceptual hexagonal example and Manuscritten examples from `research.md`.
2. Review the argument and examples with the user.
3. Write final `post1/article.md` only after the draft is approved.
4. Before drafting post 2, confirm the exact schema and the final runtime phrasing.
