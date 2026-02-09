# Repository Guidelines

## Purpose (This Repo)
This repository is the home for **blog articles**. Each article (or series) lives in its own folder.

Articles usually reference real code changes from other projects. To make that workflow easy, we typically symlink the relevant product/code repo (or worktree) into the article folder so Codex can read diffs and review code while helping write the post.

## Folder Structure
Follow the structure defined in `README.md`:
- One folder per article or series (e.g. `my-post/`, `payments-series/`).
- Each article folder usually contains a symlink named `ref/` pointing to the repo/worktree that contains the changes being written about.
- For a series, you can share the same `ref/` across multiple posts under the series folder.

Example series layout:
```
payment-series/
  ref/
  post1/
    context.md
    article.md
  post2/
    context.md
    article.md
```

## Linking A Repo/Worktree
We use the **article-linker** utility to create the symlink. It will prompt you (via `fzf`) to choose an article folder under `~/personal/articles/`, then create/update `ref/` inside that folder.

Expected location:
```
/home/javi/personal/articles/<article-folder>/ref
```

Example:
```bash
article-linker /path/to/repo
# (then pick an article folder in fzf, e.g. `my-post`)
```

Result:
```
/home/javi/personal/articles/my-post/ref -> /path/to/repo
```

## Using Codex (Recommended)
- Start Codex from the articles repo root with `./codex-local` so the correct model is selected.
- Then point Codex at the relevant article folder (or mention the linked `ref/` repo) and ask it to review changes, diffs, and draft the article.

## Manuscritten Articles
If the article is about Manuscritten, also read `manuscritten.md` in this repo (sometimes symlinked into an article folder). It contains the current “how to navigate the codebase” notes for the `ref/` symlinked repo.

For now, we keep those notes mirrored here as well (keep `manuscritten.md` as the canonical source).

### Manuscritten — brief context
Manuscritten is a platform for creating and sending handwritten letters as part of acquisition and retention campaigns. Letters are configured in a web app (text, typography, margins, signature, QR, design), converted into print instructions (primarily SVG), and executed by writing robots.

Sending modes:
- One-off campaigns (CSV upload).
- Automated campaigns via integrations (Zapier/HubSpot/API).
- Single letters for ad-hoc use.

Core components:
- Next.js app (UI + API) for campaigns, letters, designs, billing, and integrations.
- Background worker for validation and batch processing.
- Robot controller service that receives print jobs and drives local hardware.
- Integrations (HubSpot, Zapier, API) that feed automated campaigns.

Credits are the primary billing unit and are charged or owed at card creation and campaign activation, depending on the campaign type. Correctness depends on transactional credit mutations under concurrency.

### Manuscritten project structure (inside `ref/`)
- `ref/apps/web/`: Next.js 16 web app (UI + API).
- `ref/apps/worker/`: Background job processor for validation and post-processing.
- `ref/packages/`: Shared libraries (`db`, `domain`, `env`, `logger`) used across apps.
- `ref/db/`: Local dev seeding utilities and `fillDb.ts`.
- `ref/docs/` and `ref/infra/`: Documentation and infrastructure assets.
- `ref/hubspot/`, `ref/zapier_integration/`: External integrations; treat as separate deployables.

### Manuscritten build/test/dev commands (run from `ref/`)
- `npm install`: Install workspace dependencies.
- `npm run dev:web`: Start the web app with dotenvx.
- `npm run dev:worker`: Start the worker using `.env.worker`.
- `npm run build:web` / `npm run build:worker`: Build web/worker targets.
- `npm run start:web` / `npm run start:worker`: Run production builds.
- `npm run lint:web`: Lint the web app.
- `npm run typecheck`: Type-check all workspaces.
- `npm run db:generate` / `npm run db:apply`: Drizzle migrations for the DB package.

### Manuscritten conventions
- Language: TypeScript (ESM), Node `20.x`.
- Indentation: follow existing files (2 spaces in JSON; 2 in TS/JS).
- Prefer domain-driven naming in `ref/packages/domain/` (e.g., `Company.ts`, `Campaign.ts`).
- Linting: ESLint (`ref/apps/web/eslint.config.mjs`).
- Formatting: Prettier (run locally if needed).

### Manuscritten testing
- Framework: Jest (`ref/apps/web/jest.config.ts`).
- Locations: `ref/apps/web/src/tests/unit/` and `ref/apps/web/src/tests/integration/`.
- Naming: `*.test.ts` or `*.test.tsx`.
- Run tests: `npm run test:web` or `npm run -w apps/web test:client|test:server-unit|test:server-int`.
- Integration tests use testcontainers and require Docker.

### Manuscritten PR hygiene
- Commits: short, imperative summaries (e.g., “Add validation”, “Fix build”).
- PRs: include intent summary, linked issue/task, and screenshots for UI changes.
- Call out env var additions and DB migrations explicitly.

### Manuscritten config/security
- Env validation lives in `ref/packages/env/`; add new variables there first.
- `.env` and `.env.worker` are loaded via dotenvx; avoid committing secrets.

## Prompt Workflow (Editorial Pipeline)
Editorial prompts live in `./prompts/`. Execute the workflow by **opening and following the instructions in the corresponding prompt file** (do not improvise your own version of the prompt).

### Prompt map (what to run, when, and what it must write)
| Prompt file | When to use | Must produce |
| --- | --- | --- |
| `prompts/1_editorial_router.md` | Always start here. Decide whether the work should be written about at all, and if so whether it should be a **SINGLE ARTICLE** or a **SERIES**, and what the core insight is. | No repo file is required by default (output is the routing decision in Markdown). |
| `prompts/2(s)_series_organizer.md` | Only if the router decided **SERIES**. Design the series at the level of articles (titles, pains, promises), not outlines or implementation detail. | `index.md` in the **series root folder**. |
| `prompts/3_article-context-extractor.md` | For each specific article to be written (single article folder, or each post subfolder inside a series). Extract implementation context via author interview + code/commit inspection. | `context.md` in the **article folder** being written. |
| `prompts/4_structure_selector.md` | After `context.md` exists. Propose multiple *distinct* structures, help pick exactly one, then persist that chosen structure. | `structure.md` (high-level/lightweight) in the **article folder** being written. |
| `prompts/5_article_structure_builder.md` | After Prompt 4 has produced `structure.md`. Expand the chosen structure into an execution-ready structure without changing sections/order. | Overwrite `structure.md` (execution-ready) in the **article folder** being written. |

### What each prompt does (short)
- `prompts/1_editorial_router.md`: Editorial gate + routing. It decides STOP vs write, and routes to **SINGLE ARTICLE** vs **SERIES** based on scope/shape and the transferability of the core insight.
- `prompts/2(s)_series_organizer.md`: Series-level structuring. It designs the series “article map” (pains, promises, titles) and writes it to `index.md` in the series root.
- `prompts/3_article-context-extractor.md`: Implementation handover. It interviews the feature author and inspects the branch/commit range to build a concrete map of key files/modules, writing it to `context.md` in the target article folder.
- `prompts/4_structure_selector.md`: Structure selection. It compares 3–5 *different* narrative structures, then writes the selected structure (and only that structure) to `structure.md`.
- `prompts/5_article_structure_builder.md`: Structure expansion. It overwrites `structure.md` with a detailed, execution-ready version that preserves the same sections and ordering.

### Routing logic (single vs series)
- If the router’s final decision is **SINGLE ARTICLE**: run the article context extractor once and write `context.md` in that article folder; then run structure selection + structure builder to produce an execution-ready `structure.md`.
- If the router’s final decision is **SERIES**: run the series organizer and write `index.md` in the series root; then for each post folder in the series, run the article context extractor to write `context.md`, then run structure selection + structure builder to produce an execution-ready `structure.md` per post.

### Skip rules (avoid unnecessary reruns)
- If a series folder already contains `index.md`, do **not** rerun `prompts/2(s)_series_organizer.md` unless explicitly requested.
- If an article folder already contains `context.md`, do **not** rerun `prompts/3_article-context-extractor.md` unless explicitly requested.
- If an article folder already contains `structure.md`, do **not** rerun `prompts/4_structure_selector.md` unless explicitly requested (e.g., to change the structure choice).
- If an article folder already contains an execution-ready `structure.md`, do **not** rerun `prompts/5_article_structure_builder.md` unless explicitly requested (e.g., to refresh details after a re-scan or new scope decisions).
- If the user provides a branch/commit range to re-scan (or explicitly asks for a refresh), reruns are allowed, but they must be deterministic:
  - Update/overwrite the existing `index.md`, `context.md`, or `structure.md` in place.
  - Do not create duplicates like `context-2.md`, `index-v2.md`, etc.

### Execution checklist (order of operations)
1) Run `prompts/1_editorial_router.md`.
2) If **SERIES** → run `prompts/2(s)_series_organizer.md` → write `index.md` in the series root.
3) For each article/post → run `prompts/3_article-context-extractor.md` → write `context.md` in that article/post folder.
4) For each article/post → run `prompts/4_structure_selector.md` → write `structure.md` (selected structure) in that article/post folder.
5) For each article/post → run `prompts/5_article_structure_builder.md` → overwrite `structure.md` (execution-ready) in that article/post folder.

## Agent-Specific Instructions
- Use the project launcher to ensure the correct model is selected for each new session.
- Start a session from this repo with: `./codex-local` (sets GPT-5.2 with medium reasoning).
- Articles in this repo default to first-person voice unless explicitly requested otherwise.
- Prefer readability over brevity when it helps understanding; teach concepts and avoid assuming reader context.
- When explaining concurrency, use a step-by-step interleaving ("dance") with a concrete example and include both pseudocode and equivalent SQL.
