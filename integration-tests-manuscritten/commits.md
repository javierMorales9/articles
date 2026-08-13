# Commit range

This series is based on the `ref/` snapshot at:

- `fd43c2be` - Deleted some innecesary items in the test harness

The post 2 research should focus on the following commits, oldest to newest:

- `12ffe05c` - Improved significantly the integration tests runtime by spawning just one postgres container and sharing a different db inside the container for each worker. Previously we were creating a whole container for each file. Reduced time from 46s/run to 11s/run
- `7853e0a3` - removed logs
- `0d4b8626` - Remove innecesary truncating by making each test have its own companies. That way we don't have to clean them. All companies can live together.
- `eb64dadf` - Setting up a template database and running the migration only once on it. Then, all the workers create their own database by copying the existing one. That avoids much of the overhead of the migration
- `74824e31` - Trying out by conserving the database and and avoiding the migration directly. But did not see much improvement
- `4f41c524` - Revert "Trying out by conserving the database and and avoiding the migration directly. But did not see much improvement"
- `b7cf1d19` - Tried to gain some extra performance by removing next/jest and inlining the command. But did not improved at all
- `c31be5ce` - Revert "Tried to gain some extra performance by removing next/jest and inlining the command. But did not improved at all"
- `fd43c2be` - Deleted some innecesary items in the test harness

Narrative focus:

- The initial server integration test setup used one PostgreSQL container per test file.
- The optimized setup starts one PostgreSQL container for the Jest server integration project.
- Each Jest worker gets its own database inside that container.
- A template database is migrated once; worker databases are created from that template.
- Tests avoid database-wide truncation by creating fresh company-scoped fixtures per test.
- Most endpoint behavior is naturally scoped through the authenticated company, so stale rows from other tests do not interfere when companies are unique.
- Two performance experiments were tried and reverted because they did not help enough:
  - reusing the container/database across separate test runs;
  - bypassing `next/jest` with a dedicated inline Jest config.

Main files and directories to inspect:

- `apps/web/src/tests/integration/server/`
- `apps/web/src/tests/utils/TestContext.ts`
- `apps/web/src/tests/utils/serverIntGlobalSetup.ts`
- `apps/web/src/tests/utils/serverIntGlobalTeardown.ts`
- `apps/web/jest.config.ts`
- `apps/web/jest.server.setup.ts`
- `packages/db/resetDb.ts`
- `packages/db/testFunctions.ts`
- root `package.json`
