# Repository Guidelines

## Purpose (This Repo)
This repository is the home for **blog articles**. Each article (or series) lives in its own folder.

Articles usually reference real code changes from other projects. To make that workflow easy, we keep a **snapshot** of the relevant product/code repo inside the article folder (usually under `ref/`) so Codex can read diffs and review code while helping write the post.

## Folder Structure
Follow the structure defined in `README.md`:
- One folder per article or series (e.g. `my-post/`, `payments-series/`).
- Each article folder usually contains a `ref/` folder containing a **snapshot** of the repo/worktree that contains the changes being written about (typically a git worktree pinned to a specific commit).
- For a series, you can share the same `ref/` across multiple posts under the series folder.
- Optionally, an article/series folder can contain `commits.md` describing the commit range to review (FIRST/LAST).

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
We use the **article-linker** utility to create/update `ref/`. The goal is that `ref/` is a **stable snapshot** for the article (so ongoing work on the original repo doesn’t change what the article is based on).

Expected location:
```
/home/javi/personal/articles/<article-folder>/ref
```

Example:
```bash
article-linker /path/to/repo
# (then pick an article folder in fzf, e.g. `my-post`)
```

If you’re creating the snapshot manually, the recommended approach is a detached worktree pinned to the article’s LAST commit:
```bash
git -C /path/to/repo worktree add --detach /home/javi/personal/articles/my-post/ref <LAST_SHA>
```

## Using Codex (Recommended)
- Start Codex from the articles repo root with `./codex-local` so the correct model is selected.
- Then point Codex at the relevant article folder (or mention the linked `ref/` repo) and ask it to review changes, diffs, and draft the article.

## Manuscritten Articles
If the article is about Manuscritten, read `manuscritten.md` in this repo. It’s the canonical “how to navigate the codebase” reference for the `ref/` snapshot (project structure, commands, conventions, testing).

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
