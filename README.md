# Articles repo

This repository is the home for all blog articles. 
Each article (or series) lives in its own folder.
We usually connect a product/code repo (or worktree) into the article folder via a symlink so Codex can review the actual changes and help write the post based on the real diff.
The symlinked folder will generally be called ref.

## Structure
- One folder per article or series (e.g. `my-post/`, `payments-series/`).
- Inside an article folder we create a symlink pointing to the repo/worktree that contains the changes being written about.
- Codex uses that linked repo to read diffs, review code, and generate the article content.
- If there are a series of articles we will have one folder per article, but all will share the same ref.
`
payment-series/
    ref/
    post1/
        context.md
        article.md
    post2/
        context.md
        article.md
    ...
`

## Linking a repo/worktree
We use the **article-linker** utility to create the symlink. The expected location is:

```
/home/javi/personal/articles/<article-folder>/ref
```

Example:

```bash
article-linker /path/to/repo /home/javi/personal/articles/my-post
```

That creates:

```
/home/javi/personal/articles/my-post/ref -> /path/to/repo
```

If you want a different layout or name for the symlink, update this README and the linker config accordingly.

## Using Codex
Always start Codex from the articles repo root with `codex-local` so the correct model is selected:

```bash
./codex-local
```

Then point Codex at the relevant article folder (or mention the linked `ref/` repo) and ask it to review changes or draft the article.
