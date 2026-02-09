# Articles repo

This repository is the home for all blog articles. 
Each article (or series) lives in its own folder.
We usually connect a product/code repo into the article folder as a **snapshot** (typically a git worktree pinned to a specific commit) so Codex can review the actual changes and help write the post based on the real diff.
That snapshot folder will generally be called `ref/`.

## Structure
- One folder per article or series (e.g. `my-post/`, `payments-series/`).
- Inside an article folder we create a `ref/` snapshot containing the codebase state being written about.
- Codex uses that snapshot repo to read diffs, review code, and generate the article content.
- If there are a series of articles we will have one folder per article, but all will share the same ref.
```text
payment-series/
    ref/
    post1/
        context.md
        article.md
    post2/
        context.md
        article.md
    ...
```

## Linking a repo/worktree
We use the **article-linker** utility to create/update the snapshot at:

```
/home/javi/personal/articles/<article-folder>/ref
```

Example:

```bash
article-linker /path/to/repo /home/javi/personal/articles/my-post
```

If you want to create the snapshot manually, pin it to the LAST commit for the article:
```bash
git -C /path/to/repo worktree add --detach /home/javi/personal/articles/my-post/ref <LAST_SHA>
```

## Using Codex
Always start Codex from the articles repo root with `codex-local` so the correct model is selected:

```bash
./codex-local
```

Then point Codex at the relevant article folder (or mention the `ref/` snapshot repo) and ask it to review changes or draft the article.
