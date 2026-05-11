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

## Agent-Specific Instructions
- Use the project launcher to ensure the correct model is selected for each new session.
- Start a session from this repo with: `./codex-local` (sets GPT-5.2 with medium reasoning).
- Articles in this repo default to first-person voice unless explicitly requested otherwise.
- Prefer readability over brevity when it helps understanding; teach concepts and avoid assuming reader context.
- When explaining concurrency, use a step-by-step interleaving ("dance") with a concrete example and include both pseudocode and equivalent SQL.
