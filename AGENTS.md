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
| `prompts/2_context_extractor.md` | After the router decision. Extract implementation context once (series-level for SERIES, or once for a SINGLE ARTICLE). Includes a technical scope map (what technical parts to cover vs exclude, in general). | `context.md` in the **series root folder** (SERIES) or the **article folder** (SINGLE). |
| `prompts/3(s)_series_organizer.md` | Only if the router decided **SERIES** (and after `context.md` exists). Design the series at the level of articles (titles, pains, promises, per-article insight), not outlines or implementation detail. | `index.md` in the **series root folder**. |
| `prompts/4_structure_selector.md` | After `context.md` exists (and `index.md` if SERIES). Pick the article’s rough content scope (in/out), then craft title + hook + CTA, then compare multiple narrative structures and persist exactly one. | `structure.md` (high-level/lightweight) in the **article folder** being written. |
| `prompts/5_article_structure_builder.md` | After Prompt 4. Expand `structure.md` into an execution-ready plan (what to say, examples, code blocks, diagrams) without writing final prose and without changing section order. | Overwrite `structure.md` (execution-ready) in the **article folder** being written. |
| `prompts/6_article_writer.md` | After Prompt 5. Write the actual article from `structure.md` + `context.md` (+ `ref/` as needed). | `article.md` in the **article folder** being written. |

### What each prompt does (short)
- `prompts/1_editorial_router.md`: Editorial gate + routing. It decides STOP vs write, captures the story/why behind the work, and routes to **SINGLE ARTICLE** vs **SERIES** based on breadth and transferability.
- `prompts/2_context_extractor.md`: Implementation handover. It inspects the branch/commit range to build a concrete map of key files/modules and a technical scope map, then interviews the author only to fill gaps. Writes `context.md` in the series root (SERIES) or article folder (SINGLE).
- `prompts/3(s)_series_organizer.md`: Series-level structuring. It designs the series “article map” (pains, promises, titles, per-article insight) and writes it to `index.md` in the series root.
- `prompts/4_structure_selector.md`: Article shaping. It selects the article’s content scope, title/hook/CTA, then compares 3–5 distinct narrative structures and persists the selected one to `structure.md`.
- `prompts/5_article_structure_builder.md`: Structure expansion. It overwrites `structure.md` with a detailed, execution-ready “what to say” plan (examples, code blocks, diagrams) while preserving the same sections and ordering.
- `prompts/6_article_writer.md`: Drafting. It turns `structure.md` into `article.md` prose.

### Routing logic (single vs series)
- If the router’s final decision is **SINGLE ARTICLE**: run the article context extractor once and write `context.md` in that article folder; then run structure selection + structure builder to produce an execution-ready `structure.md`.
- If the router’s final decision is **SERIES**: run the series organizer and write `index.md` in the series root; then for each post folder in the series, run the article context extractor to write `context.md`, then run structure selection + structure builder to produce an execution-ready `structure.md` per post.
 
Updated routing (v2):
- If **SINGLE ARTICLE**:
  - Run `prompts/2_context_extractor.md` → write `context.md` in that article folder.
  - Run Prompt 4 → Prompt 5 → Prompt 6 to produce `structure.md` (selected), `structure.md` (execution-ready), and `article.md`.
- If **SERIES**:
  - Run `prompts/2_context_extractor.md` once at the series root → write `context.md` in the series root.
  - Run `prompts/3(s)_series_organizer.md` → write `index.md` in the series root.
  - For each post folder → run Prompt 4 → Prompt 5 → Prompt 6 to produce `structure.md` and `article.md` per post.

### Skip rules (avoid unnecessary reruns)
- If a series folder already contains `context.md`, do **not** rerun `prompts/2_context_extractor.md` unless explicitly requested.
- If a series folder already contains `index.md`, do **not** rerun `prompts/3(s)_series_organizer.md` unless explicitly requested.
- If an article folder already contains `structure.md`, do **not** rerun `prompts/4_structure_selector.md` unless explicitly requested (e.g., to change the structure choice).
- If an article folder already contains an execution-ready `structure.md`, do **not** rerun `prompts/5_article_structure_builder.md` unless explicitly requested (e.g., to refresh details after a re-scan or new scope decisions).
- If an article folder already contains `article.md`, do **not** rerun `prompts/6_article_writer.md` unless explicitly requested (e.g., to regenerate after structure changes).
- If the user provides a branch/commit range to re-scan (or explicitly asks for a refresh), reruns are allowed, but they must be deterministic:
  - Update/overwrite the existing `index.md`, `context.md`, or `structure.md` in place.
  - Do not create duplicates like `context-2.md`, `index-v2.md`, etc.

### Execution checklist (order of operations)
1) Run `prompts/1_editorial_router.md`.
2) Run `prompts/2_context_extractor.md` once:
  - SERIES → write `context.md` in the series root.
  - SINGLE → write `context.md` in the article folder.
3) If **SERIES** → run `prompts/3(s)_series_organizer.md` → write `index.md` in the series root.
4) For each article/post → run `prompts/4_structure_selector.md` → write `structure.md` (selected structure) in that article/post folder.
5) For each article/post → run `prompts/5_article_structure_builder.md` → overwrite `structure.md` (execution-ready) in that article/post folder.
6) For each article/post → run `prompts/6_article_writer.md` → write `article.md` in that article/post folder.

### Modifying prompts (how to change the pipeline safely)

Prompts are “workflow code”: small changes can have big downstream effects. When editing any file under `prompts/`, follow this checklist.

**1) Keep the contract stable**
- Every prompt must declare: purpose, allowed/forbidden behaviors, required inputs, and required output artifact(s).
- If a prompt writes a file, it must specify:
  - exact filename
  - exact location (series root vs article folder)
  - overwrite vs append behavior (default: overwrite; deterministic)

**2) Maintain determinism**
- Do not introduce new outputs like `context-v2.md` or `structure-2.md`.
- If reruns are allowed, they must overwrite the same target file.

**3) Update all references**
- If you rename/reorder prompts, update:
  - the prompt filenames in `AGENTS.md`
  - any “Next steps” blocks inside prompts
  - any in-repo docs that mention old prompt names (use `rg` to find stale references)

**4) Prefer “code-first, question-second”**
- If a prompt can learn facts from `ref/` + diffs + existing artifacts, it should do that first.
- Interview questions should fill gaps only (max 4 questions per turn rule still applies).

**5) Calibrate with examples**
- Prompts that generate plans (especially Prompt 4/5) should include:
  - at least one ✅ good example (meets requirements)
  - at least one ❌ bad example (what not to do) + why it’s bad
- For concurrency topics, examples should include:
  - a concrete “dance” (interleaving) with visible state values
  - both pseudocode and equivalent SQL

**6) Keep responsibilities separated**
- `context.md` is implementation ground truth + technical scope map (no editorial series layout).
- `index.md` is the editorial series map (titles, pains/promises, per-article insight, per-article scope boundary).
- `structure.md` is per-article planning (Prompt 4 selects; Prompt 5 makes it execution-ready).
- `article.md` is prose only (Prompt 6).

**7) Sanity checks after edits**
- Ensure Markdown fences are balanced (no unclosed code blocks).
- Ensure “REQUIRED OUTPUT STRUCTURE” blocks match the actual described behavior.
- Run `rg` for stale filenames (e.g., `context_extractor.md`, `2(s)_series_organizer.md`).

## Agent-Specific Instructions
- Use the project launcher to ensure the correct model is selected for each new session.
- Start a session from this repo with: `./codex-local` (sets GPT-5.2 with medium reasoning).
- Articles in this repo default to first-person voice unless explicitly requested otherwise.
- Prefer readability over brevity when it helps understanding; teach concepts and avoid assuming reader context.
- When explaining concurrency, use a step-by-step interleaving ("dance") with a concrete example and include both pseudocode and equivalent SQL.
- For any new “write about this work” request, start with `prompts/1_editorial_router.md` unless the user explicitly tells you to resume at a later prompt.
- For `prompts/2_context_extractor.md` and `prompts/3(s)_series_organizer.md`, always do an explicit scope pass:
  - Propose a specific in-scope list and out-of-scope list (flows/behaviors).
  - Ask the author to confirm/correct scope (max 4 questions per turn rule still applies).
  - Do not proceed to writing `context.md` / `index.md` until scope is confirmed.
  - Also ask the mandatory confirmation questions declared inside each prompt (feature definition, alternatives, testing invariants, operational expectations, and series-map confirmation).
