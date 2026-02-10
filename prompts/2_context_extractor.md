# Prompt 2 — Work Context Extractor (Series or Single)

## Purpose

This prompt is responsible for building the **full technical context of a piece of work** so it can be written about as:

- a **SERIES** (single shared context for the whole series), or
- a **SINGLE ARTICLE** (one shared context for the article)

Nothing else.

It does **not** write an article.
It does **not** decide narrative, tone, or motivations.
It does **not** extract code snippets.

Its only job is to:

1. Inspect the **feature branch (or a specified commit range)** to identify the **key files and functions** involved, and explain their role in the feature.
2. Interview the feature author **only to fill gaps** that are not obvious from the code changes (intent, rejected alternatives, constraints).
3. Produce a **technical scope map** for later prompts:
   - what technical areas are “in play” for writing (in general)
   - what technical areas are explicitly excluded to keep the work focused

The result of this prompt is a single file:

> **`context.md`**

stored in the folder that is being written about:

- If the work is a **SERIES**: store `context.md` in the **series root folder**.
- If the work is a **SINGLE ARTICLE**: store `context.md` in the **article folder**.

---

## Scope boundaries (very important)

This prompt is **strictly about the implementation itself**.

It intentionally ignores:

* Business motivations
* Product strategy
* Narrative framing
* Lessons learned
* Editorial decisions

Those will be handled by other prompts.

Here we only answer:

> *What was built, how it works, and where it lives in the codebase.*

This includes a **technical scope map** (Section 7) to prevent later prompts from drifting into unrelated subsystems.

---

## Instructions for the agent

### Fixed constraints

* Output language: **English**
* Output format: **Markdown**
* Output file name: **context.md**
* Do not write any article text
* Do not invent information

### Interaction rules

* You may ask multiple questions at once, but **no more than 4 questions per turn**.
* Questions must be grouped logically.
* If critical information is missing, you must ask follow‑up questions before proceeding.

### Mental model

Act as a **senior engineer performing a feature handover**.
Your goal is to fully understand the implementation so another engineer could work on it confidently.

---

## Phase 1 — Inspect the feature branch (FIRST)

Your first task is to inspect the code changes (commit range / linked `ref/` snapshot).

Goal: identify what is already obvious from the diff (flows, files, primitives used, tests, CI wiring) so you do **not** ask redundant questions.

### Tasks

1. Review the changes introduced by the feature.
2. Identify the **most relevant files**.
3. Within those files, identify the **key functions, classes, or modules**.
4. Identify any **unknowns** that require author input (gaps, intent, alternatives, constraints).

### Important notes

* Do **not** extract full code snippets.
* Do **not** explain line‑by‑line logic.
* Focus on **structure and responsibility**, not implementation detail.

You must ask questions covering, at minimum, the following areas:

### A. Feature definition

* What does the feature do, in concrete terms?
* What user‑visible behavior changed?
* How did the application behave *before* vs *after* this feature?

### B. Design decisions

* Why was this design chosen?
* What alternative designs were considered
* Why were those alternatives rejected?

### C. Execution and constraints

* What constraints influenced the implementation (technical, time, compatibility, etc.)?
* What assumptions were made?

### D. Testing and validation

* How was this feature tested?
* What kinds of tests were added or modified?

### E. Operational characteristics

* What volume of operations is this code expected to handle?
* Are there any performance, concurrency, or scaling considerations?

You may add **additional questions** if they are necessary to fully understand the work, but stay strictly within implementation scope.

### Question discipline (MANDATORY)

- Ask **only** the questions that remain unanswered after Phase 1 inspection.
- Do not ask about facts that are directly readable from the code changes (paths, primitives used, test names, CI steps).
- Maximum 4 questions per turn still applies.

Do not move to Phase 2 until Phase 1 inspection is complete and the necessary questions have been answered.

## Phase 2 — Interview the feature author (SECOND)

After Phase 1 inspection, interview the author to fill gaps discovered during inspection.

The interview must still cover, at minimum (only if not already clear from code):
- Feature definition (before/after)
- Design decisions (alternatives + trade-offs)
- Constraints/assumptions
- Testing/validation intent
- Operational expectations under load

---

## Required output structure (context.md)

You must output a single Markdown document with **exactly** the following structure:

```md
# Feature Context

## 0. Scope
- Form: SERIES | SINGLE ARTICLE
- In-scope flows (explicit)
- Out-of-scope flows (explicit)

## 1. Feature overview
- What the feature does
- Before vs after behavior

## 2. Design and implementation decisions
- Chosen design
- Alternatives considered
- Key trade‑offs

## 3. Constraints and assumptions
- Technical constraints
- Assumptions made

## 4. Testing and validation
- Testing approach
- Relevant test types

## 5. Operational expectations
- Expected load or volume
- Performance or concurrency notes

## 6. Codebase map

### Key files
- path/to/file.ext — responsibility
- path/to/another.ext — responsibility

### Key functions / modules
- functionOrModuleName — role in the feature
- anotherFunction — role in the feature

## 7. Technical scope map
- In-scope technical areas (names only)
- Out-of-scope technical areas (names only)
```

---

## Output rule

The final answer must be **only** the contents of `context.md` in Markdown.
No explanations, no commentary, no extra text.

---

## Next step (out of scope here)

Later prompts will:

* Attach business/product motivation
* Design the article structure
* Extract and explain code snippets

This prompt deliberately stops before that.
