# Repository Guidelines

## Project Structure & Module Organization
- `ref/apps/web/`: Next.js 16 web app with tRPC API, Clerk auth, and Stripe flows.
- `ref/apps/worker/`: Background job processor for validation and post-processing.
- `ref/packages/`: Shared libraries (`db`, `domain`, `env`, `logger`) used across apps.
- `ref/db/`: Local dev seeding utilities and `fillDb.ts`.
- `ref/docs/` and `ref/infra/`: Documentation and infrastructure assets.
- `ref/hubspot/`, `ref/zapier_integration/`: External integrations; treat as separate deployables.

## Build, Test, and Development Commands
Run from `ref/` unless noted:
- `npm install`: Install workspace dependencies.
- `npm run dev:web`: Start the web app with dotenvx.
- `npm run dev:worker`: Start the worker using `.env.worker`.
- `npm run build:web` / `npm run build:worker`: Build web/worker targets.
- `npm run start:web` / `npm run start:worker`: Run production builds.
- `npm run lint:web`: Lint the web app.
- `npm run typecheck`: Type-check all workspaces.
- `npm run db:generate` / `npm run db:apply`: Drizzle migrations for the DB package.

## Coding Style & Naming Conventions
- Language: TypeScript (ESM), Node `20.x`.
- Indentation: follow existing files (2 spaces in JSON; 2 in TS/JS).
- Prefer domain-driven naming in `ref/packages/domain/` (e.g., `Company.ts`, `Campaign.ts`).
- Linting: ESLint (`ref/apps/web/eslint.config.mjs`).
- Formatting: Prettier (run locally if needed).

## Testing Guidelines
- Framework: Jest (`ref/apps/web/jest.config.ts`).
- Locations: `ref/apps/web/src/tests/unit/` and `ref/apps/web/src/tests/integration/`.
- Naming: `*.test.ts` or `*.test.tsx`.
- Run tests: `npm run test:web` or `npm run -w apps/web test:client|test:server-unit|test:server-int`.
- Integration tests use testcontainers and require Docker.

## Commit & Pull Request Guidelines
- Commits: short, imperative summaries (e.g., “Add validation”, “Fix build”).
- PRs: include intent summary, linked issue/task, and screenshots for UI changes.
- Call out env var additions and DB migrations explicitly.

## Configuration & Security Tips
- Env validation lives in `ref/packages/env/`; add new variables there first.
- `.env` and `.env.worker` are loaded via dotenvx; avoid committing secrets.

## Agent-Specific Instructions
- Use the project launcher to ensure the correct model is selected for each new session.
- Start a session from this repo with: `./codex-local` (sets GPT-5.2 with medium reasoning).
- Article writing: use the `long-posts-writer` skill (template lives in its `references/ARTICLE_PROMPT.md`).
- LinkedIn writing: use the `linkedin-posts-writer` skill (template lives in its `references/LINKEDIN_PROMPT.md`).
- For any article in this repo, outline the post using `strategy.md` (open loops pattern) before drafting.
- Articles in this repo default to first-person voice unless explicitly requested otherwise.
- Prefer readability over brevity when it helps understanding; teach concepts and avoid assuming reader context.
- When explaining concurrency, use a step-by-step interleaving ("dance") with a concrete example and include both pseudocode and equivalent SQL.

## Article Series Workflow (fixes_to_manuscritten_payment_system)
- Maintain `fixes_to_manuscritten_payment_system/context.md` describing the series and planned articles.
- Create one article per process step.
- Always propose and discuss an outline before drafting full articles; do not write the article until explicitly asked.
- The first article is an introduction covering: what Manuscritten is, how the issue was discovered, and how the API worked before the fixes.
- For outlines and post structure, follow `strategy.md` (open loops pattern).
