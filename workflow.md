# Article Series Workflow

This repository is organized around article series. A single standalone article is still treated as a one-post series. The goal is to let Codex resume work reliably by inspecting files, instead of depending on chat history.

All files in this repository must be written in English, including drafts and final articles. The conversation with the user may happen in Spanish.

## Core Idea

Each series explains technical work that has already happened elsewhere. Most series are backed by a real codebase snapshot under `ref/` and a commit range in `commits.md`.

The snapshot exists so the article can stay tied to the actual implementation: endpoints, classes, migrations, tests, load scripts, tradeoffs, and diffs. Codex should read the implementation before shaping the article.

## Required Series Structure

Use one folder per series:

```text
article-series-name/
  ref/
  commits.md
  research.md
  posts.md
  post1/
    schema_ref.png
    draft.md
    article.md
  post2/
    draft.md
    article.md
```

Only `ref/` and `commits.md` are required before writing begins. The rest are produced as the workflow progresses.

## Preparing A Series

Before research or drafting starts, the series must be linked to the relevant codebase with `article-linker`.

Expected result:

```text
/home/javi/personal/articles/<series-folder>/ref
/home/javi/personal/articles/<series-folder>/commits.md
```

If `ref/` or `commits.md` is missing, Codex must stop and tell the user to run `article-linker` first. Article work should not proceed from memory or from an unpinned live repo unless the user explicitly overrides this rule.

## Startup And Resume Protocol

Whenever Codex starts work on a series, it should:

1. Identify the series folder.
2. Verify that `ref/` and `commits.md` exist.
3. Read `commits.md`.
4. Inspect `research.md`, `posts.md`, and all `post*/draft.md` and `post*/article.md` files.
5. Infer the current phase from the filesystem.
6. Report the detected phase and proposed next action.
7. Continue from that point.

The current phase must be inferred from files, not from chat history alone.

Example status report:

```text
I found the `fix_manuscritten_payment_system` series.
It has `ref/`, `commits.md`, `research.md`, and `posts.md`. `post1/draft.md` exists but `post1/article.md` does not, so the current phase is draft review or final article writing for post 1.
```

## Phase Detection

### 0. Series Not Prepared

Signals:

- `ref/` is missing.
- `commits.md` is missing.

Action:

- Stop and ask the user to run `article-linker`.
- Do not start research, planning, drafting, or final writing.

### 1. Research Pending

Signals:

- `ref/` exists.
- `commits.md` exists.
- `research.md` does not exist.

Action:

- Read the commit range.
- Review the relevant diffs and current files in `ref/`.
- Identify endpoints, classes, methods, scripts, tests, migrations, and domain concepts that matter.
- Write `research.md`.

`research.md` should contain grounded facts, not article prose.

### 2. Series Planning Pending

Signals:

- `research.md` exists.
- `posts.md` does not exist.

Action:

- Discuss the series structure with the user.
- Prefer one article per focused idea.
- Once agreed, write `posts.md`.

`posts.md` should include the number of posts and what each one will cover.

### 3. Post Schema Pending

Signals:

- `posts.md` exists.
- The next post does not have `draft.md`.
- The user has not provided a schema, outline, mind map image, or section notes.

Action:

- Ask the user for the schema or wait for instructions.
- Do not invent the whole article structure unless the user asks for help planning it.

### 4. Draft Pending

Signals:

- The user has provided a schema, outline, mind map image, or section notes.
- The target post does not have `draft.md`.

Action:

- Convert the schema into `postN/draft.md`.
- Preserve the intended structure.
- Fill in missing concrete details only where the schema asks for them or where they are necessary for clarity.

Common expansions:

- If the schema says to include an example, write a concrete example.
- If the schema says to include a diagram, create the Mermaid diagram.
- If the schema says to include code, inspect `ref/` and add a minimal explanatory snippet.
- If the schema leaves a technical concept underdeveloped, add enough detail for the later article to be coherent.

### 5. Draft Review

Signals:

- `draft.md` exists.
- `article.md` does not exist.
- The user has not yet asked for final prose.

Action:

- Revise `draft.md` with the user.
- Keep the work structural and factual.
- Avoid drifting into polished final prose too early.

### 6. Final Article Writing

Signals:

- `draft.md` exists.
- The user explicitly asks to write the article.

Action:

- Write `article.md` as publishable prose.
- Use first-person voice by default.
- Teach concepts clearly and do not assume the reader already knows the local system.
- Use the draft as the source of truth unless the user updates direction.

### 7. Post Complete

Signals:

- `article.md` exists.

Action:

- Treat the post as written.
- Compare against `posts.md` to identify the next post, if any.
- If all planned posts have `article.md`, the series is complete unless the user asks for revisions.

## File Responsibilities

### `commits.md`

Describes the relevant commit range. Codex should use it to review the actual implementation history.

### `research.md`

Stores technical research for the series:

- Relevant commit range and high-level diff summary.
- Important files and why they matter.
- Domain model and workflow.
- Bugs, constraints, tradeoffs, and decisions.
- Tests or verification scripts.
- Quotes or snippets only when they help anchor the facts.

This file is not an article outline.

### `posts.md`

Stores the agreed editorial structure:

- Number of posts.
- Working title or theme for each post.
- What each post includes.
- What each post intentionally leaves for another post.

This file is the map of the series.

### `draft.md`

Stores the detailed structure for one article:

- Headings and section order.
- Paragraph-level notes.
- Examples to include.
- Code snippets to include.
- Mermaid diagrams.
- Open questions or decisions still pending.

This file is the blueprint for final prose, not the final article.

### `article.md`

Stores the final article text.

Use `article.md` as the default final prose filename. Do not create `final.md` unless the user explicitly asks for that name.

## Writing Guidelines

- Default to first-person voice.
- Prefer clarity over brevity when it helps the reader understand the technical idea.
- Explain local domain concepts before relying on them.
- Use concrete examples.
- When explaining concurrency, use a step-by-step interleaving with a concrete example, plus pseudocode and equivalent SQL.
- Keep code snippets short. Include only the lines needed to make the point.
- Prefer Mermaid for diagrams.
- Avoid turning `research.md` or `draft.md` into polished article prose too early.

## Code Research Guidelines

When researching a series:

- Start from `commits.md`.
- Use `git` inside `ref/` to inspect the relevant commits and diffs.
- Search for filenames, methods, endpoint names, tests, and scripts mentioned by the user.
- Prefer facts from the code over assumptions from memory.
- If the article is about Manuscritten, read `manuscritten.md` before navigating `ref/`.

The output should help future writing sessions resume without repeating the same code archaeology.

## Resume Rules

Codex should always resume from the latest durable artifact:

- No `research.md`: do research.
- No `posts.md`: plan the series.
- No `draft.md` for the current post: wait for or process the schema.
- `draft.md` exists but no `article.md`: continue draft review or write final prose if requested.
- `article.md` exists: move to the next post or revise the article if requested.

If the filesystem and user request conflict, explain the mismatch and ask for confirmation before doing large edits.
