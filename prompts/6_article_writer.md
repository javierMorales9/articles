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
- Match the intended tone for this series:
  - friendly and conversational
  - uses analogy to make concurrency “imaginable”
  - light humor is allowed, but never at the expense of clarity
  - keep it high-signal; no standup comedy and no memes

## What this prompt MUST NOT do

- ❌ Change the article’s structure
- ❌ Introduce new major claims, examples, or sections
- ❌ Turn the article into a generic tutorial unrelated to the triggering pain
- ❌ Add “bonus” topics outside the agreed scope
- ❌ Fabricate facts about the codebase: if something isn’t in `ref/` or `context.md`, ask

## Style rules

- Audience: professional backend/product engineers; assume baseline familiarity with Postgres, transactions, and concurrency vocabulary.
- Tone: pragmatic, startup-minded, high signal (friendly voice; analogies; light humor).
- Keep paragraphs short; prefer concrete details over abstractions.
- When explaining concurrency, make the interleaving explicit (Request A / Request B) and keep state values visible.
- Never assume domain knowledge:
  - If you introduce a domain term (e.g., “credits”, “card”, “available credits”, “due credits”), first attach it to a business/user concept in one plain sentence.
  - Do not introduce internal variable/column names “from thin air”. If you use names like `availableCredits`/`dueCredits`, define them in story terms immediately.
  - General rule: **business concept first → implementation term second**.
- Always include the “why this example” insight when using a real product/company:
  - If the author introduces a company/product name (especially their own), explicitly state *why that example is being used* (what the author learned there; why it’s a good concrete case).
  - If the reason is unclear, ask the author before writing.
  - General rule: **why this example first → then the example details**.
- Treat `structure.md` as a plan, not prose:
  - Do not copy bullet points verbatim into the article.
  - Convert beats into clear explanations in your own words.
  - Remove meta-instructions like “Make it imaginable:” or “What to say:”; write the imagined scenario directly.
- Avoid “narrating the article-writing process”:
  - Don’t write phrases like “To read it:”, “As you can see”, “Let’s explain”, “Now we’re going to…”, or “Notice how…”.
  - Instead, write the explanation directly in a natural article voice (e.g., “`blocked_pid` is the waiter; `blocking_pid` is the holder.”).
- Use bullets sparingly:
  - Bullets are great for checklists and step sequences.
  - Prefer prose when explaining concepts, tradeoffs, and “why” (develop the idea; don’t dump bullets).
- Prefer “build from premises” explanations:
  - Start with one concrete, imaginable setup.
  - Define any technical term you need (e.g., “critical section”) in plain language.
  - Combine premises into a full picture.
  - Explain the mechanism using the first 2-3 steps before introducing a general formula.
  - End with a concrete “this gets bad fast” example and a crisp action-oriented conclusion.
- Allow controlled emotional emphasis on high-stakes moments:
  - When a result is genuinely severe (outage risk, money bugs, silent correctness drift), explicitly signal it in plain language.
  - Use one short emphatic sentence (or a brief exclamation) to make the risk felt, not just understood.
  - Do not overuse; save emphasis for the truly important “this is unacceptable” moments.
- Ensure headings match content:
  - If a subsection is titled “Why it works”, it must actually explain the mechanism *and* the real-world footguns (e.g., lock coverage + lock ordering/deadlocks).
  - If you introduce an endpoint/feature (“delete card restores credits”), briefly define it before using it as an example.
  - Don’t jump straight into an example/dance; add a one-sentence lead-in that frames what the reader is about to see (“To see how this behaves under concurrency…”), without sounding like instructions.
  - If you show a query/output table, explain:
    - where the data comes from (which Postgres catalog/view/function),
    - how to read the output (what each column means),
    - what decision it supports (why the reader should care).
  - If you mention operational knobs (`lock_timeout`, `statement_timeout`, `log_lock_waits`, retries), define in one sentence each:
    - what it does,
    - why it’s needed in this failure mode.
- Humor is allowed, but it cannot replace explanation:
  - Never use a “funny” sentence as a substitute for the missing technical explanation.
  - If you use a humorous line, immediately follow with the concrete meaning (what exactly is happening, why it matters).
- Operational settings must be actionable (not just named):
  - When introducing timeouts/log settings, explain:
    - where they are configured (DB config vs role/database vs session, or `SET LOCAL` inside a transaction),
    - a reasonable starting value range (and that it’s workload-dependent),
    - tradeoffs/disadvantages (false failures, retries, user-visible errors).
- Punctuation/style constraint:
  - Do not use em dashes (`—`). Prefer commas, parentheses, or short sentences.
- “Theory needs a picture” rule:
  - When you state an abstract insight (when to use something, why it works, why it’s better), include a concrete example immediately after, so the reader can imagine it.
  - Prefer examples that name specific entities/tables/steps, not vague “imagine you have many tables” phrasing.
 - Performance evidence rule:
  - When you cite benchmark results (avg, p95, throughput), explain what the benchmark *does* at a high level (workload and what is being measured), without dumping implementation details like script names, endpoints, or harness internals unless the author explicitly wants them.
  - Do not conflate latency and throughput:
    - avg/p95 are durations (time per request), not a request rate.
    - If you derive a rough “time to finish the run”, show the workload numbers (requests, concurrency) and keep it explicit that it is an approximation.

## Canonical “insight + example” pattern (MUST emulate)

When you write an abstract insight, immediately ground it with a specific example that has named objects and a short step sequence. Use this as the reference style.

Example (advisory locks flexibility):

Insight:
Advisory locks are flexible. They are useful when the thing you need to serialize is not naturally a single row, or it spans multiple tables.

Grounding example (make it specific):
Here is a concrete situation where that flexibility matters.

Imagine your “charge credits for a card” workflow touches several tables, and not all of them have a single obvious row you can lock that the whole team will naturally remember to lock first:

- `company_credits` stores the current balances (`available_credits`, `due_credits`).
- `credits_ledger` is append only and stores every credit mutation for audits and debugging.
- `company_usage_monthly` stores rollups for dashboards and alerts (for example, “credits spent this month”).
- `card` stores the card itself, including whether it ended up charged or owed.

Now picture what one request does, all for the same company:

1) Insert the new card row.
2) Decide charged vs owed based on the current credit balances.
3) Update `company_credits` (decrease available, or increase due).
4) Insert one row into `credits_ledger` that records what happened.
5) Update `company_usage_monthly` so the UI and alerts stay current.

Then conclude the point:
With an advisory lock, the rule is easy to express: at the top of the transaction, take one mutex by `companyId`, then do the multi-table workflow safely. With row locks, you need a strict gate convention that is easy to accidentally bypass as the codebase grows.

## Canonical “bad vs good” example (MUST emulate)

When you introduce an insight, show it as a contrast:

- **Bad/naive mental model** (what people assume).
- **Good/real model** (what actually happens).

Use this exact style for SERIALIZABLE and for any other non-intuitive mechanism.

Example (Serializable isolation, commit-time abort):

Bad mental model:
"Serializable means I do not need locks, so both requests can just run, and both will succeed, and Postgres will magically keep the balance correct."

Good model (concrete dance with numbers):
Imagine a company has 100 available credits, and two card creations arrive at the same time. Each card costs 7 credits.

Request A starts a serializable transaction, reads 100, decides charged, and prepares to write 93.
Request B does the same in parallel, reads 100, decides charged, and prepares to write 93.

One transaction will commit first. Suppose A commits, so the company now has 93.
When B tries to commit, Postgres realizes B's decision was based on a balance that is no longer current, so it aborts B with `SQLSTATE 40001` and rolls back the transaction.

Correctness is preserved, but B did not succeed. If you want the second card to be created, you must retry B. On retry it reads 93, writes 86, and commits.

Conclusion:
Serializable preserves correctness by aborting and forcing retries. It does not preserve success unless you implement retries, and it does not remove your decision logic. It changes the failure mode from waiting to abort plus retry.

---

## Canonical development example (MUST emulate)

When explaining lock queueing/latency amplification, develop it like this. This is the canonical “how to write it” example. Preserve the spirit and structure even if numbers change.

Concrete example:
First we will put a very concrete example that people can imagine in their heads: Let's imagine that a particular company is very active and that sends 10 cards/s, one every 100ms. So the first card arraives at second 0, the second one at 0.1s, the third at 0.2, etc.
Another premise (in this case people are already into the story and don't need that much introduction but we still need to explain clearly what the critical section is): Let's also suppose for example that our critical section, which is the time each card creation takes the lock, is of 300ms.
Now we join the two premises (so people can have a total picture): So, every 100ms we receive a new card. And that card takes 300ms to be processed.
The problem: In this case, as you can see, our reception rate is greater that our processing rate. In this endpoints didn't have to take the lock on the company row this would not be a problem because the requests could be processed in paralallel. But here we can't, because each of these ones will try to take the lock. And so we only have to process one at each precise moment and so the requests will queue up.
The effect of the problem (here we build up from principles, not just throw the (i - 1) * 200 ms formula): To see how this queue up works, let's consider the first two requests. The first request will arrive at second 0 and can start to be processed automatically. The second one, however, will arrive at second 0.1 but will have to wait 200ms until the first one finishes being processed so its processing can start. So suddenly the processing time of the second request has increased from 300ms to 500ms. And it will be worse for the third one, this one will arrive at second 0.2 and will have to wait 100ms for the first one to finish and another complete 300ms from the second one, for a total 700ms. In general, the amount of time the ith request will have to wait before it can start being processed is (i - 1) * 200ms.
A final example as a conclusion to illustrate how bad it is: So for example, if we wait 10 seconds the 100th request wil have to wait 99 * 100ms = 19.8 seconds before it can start being processed!!! Which is absolutely unsustainable.
Conclusion: For that reason, if you want to use this approach you have to make sure that your arrival time per lock is greater than the processing time (make 300ms lower or 100ms faster), otherwise you will end up having an outage.

## Interactive workflow (SUPPORTED)

If the author asks to write the article interactively, follow the requested granularity exactly.
If the author requests a **mode switch** mid-run (e.g., paragraph → section), switch immediately.

### Mode A — Paragraph-by-paragraph (when the author wants fine-grained control)
1) Select the next paragraph in `structure.md` (in-order; do not skip ahead).
2) Produce:
   - **Draft paragraph text** (final prose, ready to paste into `article.md`)
   - **Reasoning note** (1–3 bullets) explaining why it’s structured that way (what it sets up, what it avoids, why the analogy/humor choice helps).
3) Ask for approval:
   - If approved → persist it by writing/updating `article.md` with the full draft so far.
   - If not approved → redraft the same paragraph using the author’s correction.
4) Auto-advance:
   - After persisting an approved paragraph, immediately propose the next paragraph (draft + reasoning) without waiting for “next”, unless the author says stop.

### Mode B — Section-by-section (when the author wants to review in larger chunks)
1) Draft the **entire next section** in one go (including its heading/subheadings and all planned code blocks/figures).
2) Provide a brief section-level reasoning note (1–5 bullets):
   - why this section is ordered this way
   - how it bridges from the previous section
   - what open loop it introduces/closes
3) Ask for approval:
   - If approved → persist by overwriting `article.md` with the full draft so far.
   - If not approved → revise the same section until approved.

Constraints still apply:
- Do not change section ordering from `structure.md`.
- Do not drift scope.
- Do not invent code or facts; use `ref/` + `context.md`.
- Use only the code blocks planned in `structure.md`, squeezed to load-bearing excerpts.

If `structure.md` stored the hook as a **beat schema** (instead of final prose), translate it into a final hook in the article while preserving:
- the beat order
- the intended meaning
- any verbatim text the author marked as locked

## Feedback loop (MANDATORY when iterating)

When the author rejects a paragraph/section and provides a correction:
1) Extract the underlying heuristic as a one-liner (e.g., “don’t tease here; state objective plainly; tease later”).
2) Apply that heuristic immediately in the redraft and for all following paragraphs.
3) If the author asks to “update the prompt”, incorporate the heuristic into this Prompt 6 file deterministically (overwrite in place; do not create duplicates).

## Output rules (MANDATORY)

- Non-interactive run (write the full article in one go): the final answer must be **only** the contents of `article.md` in Markdown (no commentary).
- Interactive run (paragraph/section iteration): the assistant response must include:
  - the proposed paragraph/section draft
  - the brief reasoning note
  - a clear approval question
