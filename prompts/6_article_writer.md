# Prompt 6 — Article Writer (Draft `article.md`)

## Purpose

This prompt writes the actual article prose (`article.md`) from the execution-ready plan produced by Prompt 5.

It is an execution step: the thinking and decisions should already be captured in:
- `structure.md` (execution-ready; produced by Prompt 5)
- `context.md` (technical ground truth; produced by Prompt 2)
- `index.md` (series map, if applicable; produced by Prompt 3)
- `ref/` snapshot (code ground truth)

## Inputs (assumed to exist)

- `structure.md` (execution-ready version)
- `context.md`
- `index.md` (if series)
- `ref/` (if code inspection is needed to extract small snippets)

If any are missing or inconsistent, ask up to 4 clarification questions and stop.

## What this prompt MUST do

- Write `article.md` in English, in first-person by default (unless the user requested otherwise).
- Follow `structure.md` exactly:
  - same section order
  - same scope boundaries (do not drift into out-of-scope topics)
  - same title, hook, and CTA
- Use the concrete examples specified in `structure.md` (names, numbers, situations).
- Include the “concurrency dance” sections as specified:
  - step-by-step interleaving
  - pseudocode
  - equivalent SQL (even if simplified)
- Include only the code blocks planned in `structure.md`:
  - small, load-bearing snippets only
  - prefer diffs/patch excerpts over full files
  - do not paste large files or long functions

## What this prompt MUST NOT do

- ❌ Change the article’s structure
- ❌ Introduce new major claims, examples, or sections
- ❌ Turn the article into a generic tutorial unrelated to the triggering pain
- ❌ Add “bonus” topics outside the agreed scope
- ❌ Fabricate facts about the codebase: if something isn’t in `ref/` or `context.md`, ask

## Style rules

- Audience: professional backend/product engineers; assume baseline familiarity with Postgres, transactions, and concurrency vocabulary.
- Tone: pragmatic, startup-minded, high signal.
- Keep paragraphs short; prefer concrete details over abstractions.
- When explaining concurrency, make the interleaving explicit (Request A / Request B) and keep state values visible.

---

## Interactive workflow (OPTIONAL but supported)

If the author asks to write the article **section-by-section**, follow this workflow:

1. Draft **one section at a time** (including its planned code blocks/figures).
2. Pause and ask the author to confirm/adjust that section before continuing.
3. After a section is approved, **persist progress** by overwriting `article.md` with the full draft so far (title + any completed sections).
4. Continue to the next section until the full article is complete.

Constraints still apply:
- Do not change section ordering from `structure.md`.
- Do not drift scope.
- Do not invent code or facts; use `ref/` + `context.md`.
- Use only the code blocks planned in `structure.md`, squeezed to load-bearing excerpts.

If `structure.md` stored the hook as a **beat schema** (instead of final prose), translate it into a final hook in the article while preserving:
- the beat order
- the intended meaning
- any verbatim text the author marked as locked

## Output rule (MANDATORY)

The final answer must be **only** the contents of `article.md` in Markdown.
No explanations, no commentary, no extra text.
