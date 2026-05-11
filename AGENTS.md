# Repository Guidelines

## Purpose (This Repo)
This repository is the home for **blog article series**. Treat every project as a series, even when it currently contains only one article.

Articles usually explain technical work that has already been done in another codebase. To make that workflow reliable, each series keeps a **stable snapshot** of the relevant product/code repo under `ref/`, plus a `commits.md` file describing the commit range that matters for the story.

For the full operating procedure, read `workflow.md`.
For editorial drafting and article-shaping rules, read `writing_rules.md`.

## Language
- All repository files must be written in English, including `research.md`, `series.md`, `draft.md`, and the final `article.md`.
- Conversation with the user may happen in Spanish, but persisted article material and workflow files stay in English.

## Folder Structure
Follow the structure defined in `README.md` and `workflow.md`:
- One folder per article series, even for one-off posts.
- Each series folder must contain `ref/` and `commits.md` before article work starts.
- `ref/` is a snapshot of the repo/worktree that contains the completed technical work, typically pinned to the last relevant commit.
- `commits.md` describes the commit range to review.
- Series-level analysis and planning live in `research.md` and `series.md`.
- Each article lives in its own `postN/` folder.

Example series layout:
```
payment-series/
  ref/
  commits.md
  research.md
  series.md
  post1/
    schema_ref.png
    draft.md
    article.md
  post2/
    draft.md
    article.md
```

## Linking A Repo/Worktree
We use the **article-linker** utility to create/update the series folder, `ref/`, and `commits.md`. The goal is that `ref/` is a **stable snapshot** for the series, so ongoing work on the original repo does not change what the article is based on.

Expected location:
```
/home/javi/personal/articles/<series-folder>/ref
```

Example:
```bash
article-linker /path/to/repo
# Then pick or create a series folder in fzf, e.g. `payment-series`.
```

If you’re creating the snapshot manually, the recommended approach is a detached worktree pinned to the article’s LAST commit:
```bash
git -C /path/to/repo worktree add --detach /home/javi/personal/articles/payment-series/ref <LAST_SHA>
```

## Using Codex (Recommended)
- Start Codex from the articles repo root with `./codex-local` so the correct model is selected.
- Then point Codex at the relevant series folder and ask it to continue from the current state.

## Manuscritten Articles
If the article is about Manuscritten, read `manuscritten.md` in this repo. It’s the canonical “how to navigate the codebase” reference for the `ref/` snapshot (project structure, commands, conventions, testing).

## Startup Protocol
When starting or resuming work on a series:
1. Identify the series folder.
2. Check whether `ref/` and `commits.md` exist.
3. If either is missing, stop and tell the user to run `article-linker` before article work begins.
4. Read `commits.md`.
5. Inspect existing workflow files: `research.md`, `series.md`, `post*/draft.md`, and `post*/article.md`.
6. Infer the current phase from the filesystem, not from chat history alone.
7. Briefly report the detected series, phase, and next action before making substantial edits.

## Phase Detection
- Missing `ref/` or `commits.md`: the series is not prepared. Ask the user to run `article-linker`.
- `ref/` and `commits.md` exist, but `research.md` does not: perform code and commit research, then write `research.md`.
- `research.md` exists, but `series.md` does not: discuss the series breakdown with the user, then write `series.md` once agreed.
- `series.md` exists, but the next post has no schema or draft: ask for the post schema or wait for instructions.
- A schema or detailed outline exists, but `draft.md` does not: convert the schema into `draft.md`.
- `draft.md` exists, but `article.md` does not: revise the draft with the user until they approve final writing.
- The user explicitly asks for final prose: write `article.md`.
- `article.md` exists: treat that post as written and move to the next post in `series.md`, if any.

## Workflow Boundaries
- `research.md` contains facts from the codebase, commit range, domain model, tests, and implementation decisions.
- `series.md` contains the agreed series structure and the purpose of each article.
- `draft.md` contains the detailed article outline, examples, diagrams, code snippets, and section-level notes.
- `article.md` contains the publishable final article.
- Do not jump from research directly to final prose unless the user explicitly asks for that.
- Do not use `final.md` as the final article filename unless the user explicitly requests it; the default final prose file is `article.md`.

## Agent-Specific Instructions
- Use the project launcher to ensure the correct model is selected for each new session.
- Start a session from this repo with: `./codex-local` (sets GPT-5.2 with medium reasoning).
- Articles in this repo default to first-person voice unless explicitly requested otherwise.
- Prefer readability over brevity when it helps understanding; teach concepts and avoid assuming reader context.
- When explaining concurrency, use a step-by-step interleaving ("dance") with a concrete example and include both pseudocode and equivalent SQL.
- Keep code snippets minimal and explanatory. Prefer short excerpts that support the point over complete functions.
- When a schema asks for an example, diagram, or code snippet, fill in the missing concrete detail in `draft.md`.
- Mermaid is the preferred format for diagrams unless the user asks for another format.
