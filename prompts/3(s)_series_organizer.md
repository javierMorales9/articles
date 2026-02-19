# Prompt 3 — Series Structure & Pain Mapping

## Purpose

This prompt is used **only when Prompt 1 has decided that the work should be a SERIES**.

Its goal is **not** to define article structure, sections, or emphasis.

Its sole responsibility is to:

> **Design the structure of the series at the level of articles**, ensuring that:
>
> * Each article is worth clicking and reading on its own
> * Each article is anchored in a clear *pain, risk, or uncomfortable truth*
> * The series as a whole feels cohesive and inevitable
>
> In addition, this prompt must produce a short **reader alignment** block (4 questions)
> that later prompts can reuse to write a strong hook and first section.

The output of this prompt must be saved as:

> **`index.md`**

inside the series folder.

This prompt operates at the level of **titles, pains, and promises**, not implementation.

Additional requirement (SERIES only):
- `index.md` must also include a lightweight **scope boundary** per article (what it covers / does not cover), expressed as *flows/endpoints/behaviors*, not sections or outlines.

---

## What this prompt is NOT allowed to do

* ❌ Define article sections or outlines
* ❌ Explain how the solution works in detail
* ❌ Turn articles into standalone, generic how-tos or checklists
* ❌ Extract code or technical details

Important clarification:

* Actionable steps **are allowed** *only when framed as a response to a specific pain or trigger*.
* A how-to is acceptable **only as a consequence of exposing a risk**, never as the primary framing.

Those concerns are explicitly deferred to later prompts.

---

## Hard rules

* Output language: **English**
* Output format: **Markdown**
* You may ask multiple questions per turn, but **no more than 4**
* Questions must be grouped logically
* Do not move to the next group until the current one is answered

---

## Inputs available to the agent

The agent will receive:

* The output of the **Editorial Router** (`prompts/1_editorial_router.md`)
* The series-level **implementation context** (`context.md`) produced by `prompts/2_context_extractor.md`

Code access is optional, but `context.md` must be treated as the primary implementation input at this stage (this prompt is editorial, not a code review).

---

## Core responsibility

The agent must:

 1. Identify the **core pain or risk** that unifies the entire series
 2. Break that pain into **distinct, standalone pains**
 3. Map each pain to a **single article**
 4. Ensure each article can be read independently
 5. Capture the **reader alignment** answers once, at the series level (reusing Prompt 1 where possible)
 6. Capture a high-level **scope boundary** for each article (explicit in-scope and out-of-scope)

The agent must think like an editor asking:

> *“If I only read this one article, would I still feel like it was worth my time?”*

---

## Prompt (use verbatim)

```text
You are helping me design the structure of a technical article series.

Your task is NOT to design the internal structure of each article.
Your task is to decide:
- how many articles the series should have
- what each article is fundamentally about
- what pain, risk, or uncomfortable truth each article exposes

You must work at the level of:
- article titles
- reader pain points
- core promises
- scope boundaries expressed as flows/endpoints/behaviors

Rules:
- Do NOT write article outlines or sections
- Do NOT explain solutions
- Do NOT turn articles into how-tos
- Each article must be valuable if read in isolation

Start by asking clarification questions (max 4 at a time) if needed.

Mandatory: before writing the series structure, you must capture answers to the 4 “reader alignment” questions below.

Reuse rule:
- Prompt 1 (router) should already have captured answers for Q1–Q4.
- Therefore, in a SERIES, you should typically need **zero** additional reader-alignment questions here unless something is missing/unclear.

Additional mandatory questions (scope) — even if router answers exist:
- Before you write `index.md`, you must ask at least **2 scope confirmation questions**:
  - confirm the series-level in-scope flows/behaviors
  - confirm the explicit out-of-scope list (what readers should NOT expect)
- These questions count toward the max 4 questions per turn.

Additional mandatory questions (series map) — do not skip:
- Before you write `index.md`, you must also confirm (at least 1 question each, possibly across turns):
  - the intended number of articles, and why (not just “2 vs 3”, but what each one must achieve)
  - the per-article scope boundaries (flows/behaviors) are correct and minimal

Do not write `index.md` until scope + series-map confirmations are answered.

Reader alignment questions:
1) What do you and the potential readers have in common (shared context)?
2) What essential ability/requirement was broken/improved, and why is it important?
3) How will this series help the reader protect that ability/requirement?
4) What will the reader learn about correctness under concurrency from the series?

Additional per-article “usefulness” question (MANDATORY):
For each article, also answer:
- What specific reader ability does this article strengthen, and under what triggering conditions/events does it apply?

---

### REQUIRED OUTPUT STRUCTURE

# Series Structure

## 0. Reader alignment (4 questions)
- 1) Common ground
- 2) Broken/improved requirement + why it matters
- 3) How the series helps
- 4) Concurrency correctness takeaway

## 1. Series spine
- Core pain or risk the entire series revolves around
- One-sentence articulation of the "fire" the reader should feel

## 2. Article map

For each article:

### Article N
- Working title
- Core pain / risk exposed
- What false assumption this article challenges
- Why this article matters *on its own*
- Specific insight / capability gained
  - What ability the reader gains
  - Trigger conditions/events where it applies
- Scope boundary (flows/endpoints/behaviors)
  - In scope (explicit)
  - Out of scope (explicit)
- Optional: high-level actionable direction (only as a response to the pain, not a how-to)

## 3. Series coherence
- How the articles relate to each other
- Why reading more than one compounds value

## 4. Editorial guardrails
- Topics explicitly excluded from the series
- Types of articles this series must NOT become (e.g. generic how-tos, tip lists without a trigger)

## 5. Next steps
- Which article should be written first
- Which prompt to run next for that article (Prompt 4 → Prompt 5 → Prompt 6)
```

---

## Examples

### ✅ Positive example — Strong series structure

**Series spine:**

> Silent data corruption is worse than downtime because you don’t know it’s happening.

**Article map:**

* **Article 1**

  * Title: "Your system looks correct — until two requests hit at the same time"
  * Pain: false confidence in correctness
  * False assumption: concurrency issues show up loudly

* **Article 2**

  * Title: "The database did exactly what you told it to do (and that’s the problem)"
  * Pain: misplaced trust in defaults
  * False assumption: ACID alone guarantees correctness

Each article stands alone but reinforces the same danger.

---

### ❌ Negative example — Weak series structure

* Article 1: "How we fixed the credits system"
* Article 2: "How we added retries"
* Article 3: "How we wrote tests"

**Why this fails:**

* Reads like internal documentation
* No pain, no tension
* Articles depend on each other to make sense

---

## Design intent

This prompt ensures the series is:

* click-worthy
* uncomfortable in the right way
* driven by risks and insights, not tips

It defines the *shape of the story*, not the story itself.
