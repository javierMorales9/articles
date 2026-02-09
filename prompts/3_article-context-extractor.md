# Article Context Extractor

## Purpose

This prompt is responsible for **building the full technical context of a specific feature**. Nothing else.

It does **not** write an article.
It does **not** decide narrative, tone, or motivations.
It does **not** extract code snippets.

Its only job is to:

1. Extract **accurate, explicit knowledge** from the feature author about the work that was done.
2. Inspect the **feature branch (or a specified commit range)** to identify the **key files and functions** involved, and explain their role in the feature.

The result of this prompt is a single file:

> **`context.md`**

stored inside the folder dedicated to the article.

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

## Phase 1 — Interview the feature author

Your first task is to interview the person who implemented the feature.

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

Do not move to Phase 2 until Phase 1 is sufficiently answered.

---

## Phase 2 — Inspect the feature branch

Once the human input is complete, you must inspect the code changes.

### Inputs

* Feature branch name **or**
* Explicit commit or commit range

### Tasks

1. Review the changes introduced by the feature.
2. Identify the **most relevant files**.
3. Within those files, identify the **key functions, classes, or modules**.
4. Explain the role each one plays in the overall feature.

### Important notes

* Do **not** extract full code snippets.
* Do **not** explain line‑by‑line logic.
* Focus on **structure and responsibility**, not implementation detail.

---

## Required output structure (context.md)

You must output a single Markdown document with **exactly** the following structure:

```md
# Feature Context

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
