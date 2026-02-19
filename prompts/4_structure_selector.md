# Prompt 4 — Article Shaper (Scope + Title/Hook + CTA + Structure)

## Purpose

This prompt shapes **one specific article** (single post or one post in a series) by:

1) Selecting the article’s **rough content scope** (what is in / out).  
2) Crafting the **title + hook** (high impact, click-worthy, aligned with the article’s insight).  
3) Defining a clear **CTA**.  
4) Comparing **3–5 distinct narrative structures**, helping the user pick **exactly one**, then writing the chosen plan to `structure.md`.

Persistence to disk happens only **after decisions are made**.

The `structure.md` produced here is **lightweight** and will be expanded by Prompt 5 into an execution-ready “what to say” plan.

---

## What this prompt is NOT allowed to do

* ❌ Write article prose
* ❌ Explain implementation details (beyond naming flows/files at a high level)
* ❌ Turn the article into a generic, context-free how-to
* ❌ Repeat the same section list across options

This prompt must make **high-level editorial decisions** (scope, hook, CTA, structure) without writing the article.

---

## Hard rules

* Output language: **English**
* Output format: **Markdown**
* Output file name: **structure.md**
* Ask clarification questions **before** generating structures (max 4)
* Do not proceed until the intent is clear

---

## Inputs available to the agent

The agent must take into account:

* The final decision and insights from **Prompt 1 — Editorial Router**
* The series context from **index.md** (if part of a series; produced by Prompt 3)
* The technical ground truth from **context.md**

Important:
- If this article is part of a **series**, `index.md` MUST include the series-level “Reader alignment (4 questions)” block.
- `context.md` MUST include a “Technical scope map” section. This prompt must use it to keep scope tight.

If any of these are missing, the agent must ask for them.

---

## Mandatory clarification (ask first; max 4 total questions)

Before proposing anything, ask only what is missing:

1) Which article are we shaping?
   - SINGLE ARTICLE, or SERIES Article N (from `index.md`).

2) Scope confirmation:
   - Are there any flows/modules that `context.md` lists as in-scope, but you want to **exclude** from *this* article?
   - Are there any flows/modules you want to **include** even if they’re only mentioned briefly elsewhere?

3) CTA:
   - What is the intended CTA for this article (subscribe/newsletter + lead magnet, “continue the series”, product promo, job search, comments, etc.)?

4) Title constraints (optional):
   - Any words you want to avoid, or a tone constraint (more “startup pragmatic” vs “academic”)?

---

## Workflow (MANDATORY ORDER)

### Step 1 — Rough content scope (in/out)

- Propose a **scope boundary** for this article expressed as flows/endpoints/behaviors:
  - In scope (explicit)
  - Out of scope (explicit)
- The scope must be consistent with:
  - the series article map (if any)
  - the technical scope map in `context.md`
- Ask the user to confirm or adjust scope.

### Step 2 — Title + hook + CTA

- Interaction rule (MANDATORY): do not show Step 3 yet.
  - In the same assistant turn where you present Step 2 options (title packages), you must **not** present narrative structure options.
  - You must wait for the user to pick/edit the title package + hook + CTA first.

- Step 2 workflow (MANDATORY): build title + hook in parts, then assemble.
  - 2.1) Hook construction (beat-by-beat; longer hooks are allowed)
    - Use a consistent multi-beat hook approach for all articles (not just “problem solving”).
    - For **each hook beat**, propose **3** options.
    - Ask the user to pick 1 (or rewrite).
    - Repeat until all beats are locked (may take multiple turns; respect the max 4 questions/turn rule).
    - Only after all beats are locked, assemble the final hook paragraph(s) verbatim and confirm it.
  - 2.2) Title selection (after hook is locked)
    - Propose **5** candidate titles (titles only).
    - Ask the user to pick 1 (or edit).
    - Titles must match the hook’s framing and not introduce new scope.
  - 2.3) CTA
    - Propose 2–3 CTAs aligned with the series and ask the user to pick 1.

- Hook beats (MANDATORY; adapt wording to the article, keep ordering)
  1) Recognizable world (what category this is; who this is for)
     - Example (from the good hook below): “Pay‑per‑use payment systems are everywhere…”
  2) The promise / expectation (what the system is supposed to guarantee)
     - Example: “The whole promise is simple: you only pay for what you use.”
  3) Why it’s hard (the implementation reality)
     - Example: “...it’s a running counter being mutated in real time...”
  4) The new pain/question (what the reader is uncertain about *now*)
     - Example: “The real problem … is concurrency.”
  5) Failure mechanism (name the failure class, in plain language)
     - Example: “...multiple requests … at the same time? Exactly: race conditions.”
  6) Stakes / consequences (explicit, imaginable outcomes)
     - Example: the two “emails you never want to write”.
  7) Credibility/stakes (why you can speak; what happened to you)
     - Example: “That’s exactly what happened to us in Manuscritten...”
  8) Why naive testing fails (why this isn’t caught by default)
     - Example: “...difficult to catch with normal unit tests.”
  9) Article promise (what the reader will learn / be able to do)
     - Example: “In this article I’m going to explain…”
  10) Open loop transition (what you’ll do first in the article)
     - Example: “But first, let me show you how our payment system works.”

- Titles must be phrased as a *how-to question* with a credibility/urgency parenthetical, e.g.:
  - “How do you know your payment system breaks under concurrency (and why it takes weeks to notice)?”
- Hooks must reuse the series “Reader alignment (4 questions)” block (if in a series) and the story/insight from Prompt 1.
- Hook quality bar (MANDATORY):
  - Make the reader *picture* the situation (recognizable scenario + named victim/system).
  - Make the reader *feel* the consequences (explicit, imaginable pain: trust loss, refunds, awkward customer emails).
  - Do not jump to “the fix” before establishing stakes.
  - End by opening a loop that transitions into the article (“But first, …” / “Before we fix it, …”).
- Ask the user to pick/edit the title, then pick/edit each hook beat, then pick the CTA.

### Step 3 — Narrative structure selection

- Interaction rule (MANDATORY): only after Step 2 is locked.
  - Do not propose structures until the user has explicitly selected/approved:
    - the title
    - the hook
    - the CTA

- Propose **3–5 distinct structures** (not templates) that fit the chosen scope + insight.
- Explain the trade-offs of each.
- Ask the user to **select exactly one**.

Only after Steps 1–3 are decided, write `structure.md`.

---

## Hook “Problem-Solving” Micro-Structure (Recommended)

Use this beat structure when the article is about solving a problem or improving a system (i.e., there is a “before” state with sharp downsides):

1) Familiar world: name a category the reader recognizes
2) The promise: what the system is supposed to guarantee
3) Why it’s hard: the implementation reality that breaks the promise
4) The antagonist: name the core technical force (e.g., concurrency)
5) Failure mechanism: the specific failure class (e.g., race conditions / lost update)
6) Consequences: explicit, imaginable pain (emails, refunds, trust loss)
7) Credibility/stakes: “this happened to us”
8) Why naive testing fails: why unit tests didn’t catch it
9) Article promise: what the reader will learn/do differently
10) Open loop transition: “But first, …”

### ✅ Good hook example (vivid + transferable)

Pay‑per‑use payment systems are everywhere. Maybe it’s AI tokens, AWS‑style usage, or credits‑per‑action. The whole promise is simple: you only pay for what you use.

That model is great for users—flexible, predictable, no upfront commitment. But it’s harder to implement, because the billing state is variable and on‑demand: it’s a running counter being mutated in real time by production traffic.

The real problem with this kind of payment system is concurrency. Because do you know what happens when multiple requests try to update the same running counter at the same time? Exactly: race conditions. Naive implementations are not enough if you don’t want to end up writing emails like: “Hey—our app showed you had more credits than you really did. You actually owe us money.” Or the other version: “We charged you too much, we’re fixing it,” followed by refunds, invoices, awkward accounting, and a customer wondering if they can trust anything your dashboard says.

That’s exactly what happened to us in Manuscritten: our payment system was broken, and we didn’t find out until we started having some serious concurrency. And that’s the worst part about this kind of errors—they’re difficult to catch with normal unit tests.

In this article I’m going to explain how these problems work, how you can reproduce them effectively, and how you can include tests in your CI to catch this class of bugs in day‑to‑day development. But first, let me show you how our payment system works.

### ❌ Bad hook example (not imaginable enough)

We had concurrency issues in our credits system. Under load it caused race conditions and inconsistent balances. In this post we’ll discuss the fix and the tests we added.

Why it’s bad:
- No concrete scenario (reader can’t picture themselves in it)
- No explicit consequences (no reason to care)
- Jumps to the fix before establishing stakes
- No open-loop transition into the article

---

## Structure generation rules

* First, propose **3–5 distinct structures** in chat
* Explain each structure briefly so the user can compare them
* Ask the user to **select exactly one** structure

Only **after** scope + title/hook + CTA + structure are selected:

- Write a single `structure.md` file.
- That file must contain **only** the chosen plan (no alternatives).
- At this stage it must be **descriptive, not exhaustive**.

`structure.md` must include:
- Working title (final)
- Hook (final)
- Primary CTA (final)
- Scope boundary (in/out; flows/endpoints/behaviors)
- Chosen narrative structure:
  - Section list
  - For each section: 1–2 lines describing what it accomplishes
  - Very rough indication of code/visual types that may appear

Include requirement (MANDATORY):
- `structure.md` must contain a dedicated top section that locks **Title + Hook + CTA** (e.g., “Title + Hook + CTA (locked early)”).
  - By default, include the **final chosen title + final chosen hook** verbatim.
  - If the user explicitly asks to defer the final written hook to Prompt 6, store instead:
    - the locked **hook beat structure** (in order)
    - the selected option per beat (or the user’s custom wording notes)
    - any “must-include phrases” and “must-avoid phrases”
  - Rationale: title/hook are the highest-leverage decisions and should visibly anchor the rest of the structure, even if final prose is deferred.

Do NOT include deep detail. Prompt 5 is where the exhaustive “what to say” plan is produced.

---

## Canonical narrative structures

The agent MUST choose from and adapt the following validated structures.
These are **thinking frameworks**, not templates.

Each proposed option must fully comply with the structure rules above.

---

### Structure A — Problem Emergence

*("Everything was fine, until it wasn’t")*

**When to use**

* The system worked correctly for a long time
* A change (scale, usage, context) introduced failure

**Flow**

1. Stable initial situation (no problem)
2. A change occurs
3. The problem starts appearing

**Good example topics**

* Concurrency bugs appearing after traffic growth
* Billing issues after automation

---

### Structure B — Hidden Problem You Didn’t Know You Had

*(Unconsidered assumptions)*

**When to use**

* The system fails only in edge or unplanned use cases
* A design assumption was silently violated

**Flow**

1. Original design and intended usage
2. New or unintended usage
3. Failure + negative consequences

**Good example topics**

* APIs reused in automation
* Features exposed to integrations

---

### Structure C — Existing Solutions Don’t Work

*(Best practices that fail)*

**When to use**

* A standard or common solution exists
* It fails under specific conditions

**Flow**

1. The commonly accepted solution
2. Case 1 where it fails
3. Case 2 where it fails

**Good example topics**

* Caching strategies
* Retry mechanisms

---

### Structure D — Comparative Evaluation of Options

*(Decision under constraints)*

**When to use**

* Multiple reasonable solutions exist
* The choice depends on context

**Flow**

1. Define the target reader
2. Define evaluation criteria
3. Evaluate each option
4. Draw conclusions

**Good example topics**

* Locking strategies
* Architectural choices

---

### Structure E — Epiphany Bridge

*(Before / after mindset shift)*

**When to use**

* You changed how you think about the problem
* The solution required a mental shift

**Flow**

1. How most people approach the problem
2. Why that approach fails or doesn’t scale
3. The insight / epiphany
4. Why things work better now

**Good example topics**

* Observability
* State management

---

### Structure F — Phases of Development

*(Context-dependent evolution)*

**When to use**

* The solution depends on scale or maturity
* Different phases require different tools

**Flow**

1. Phase 1 (small scale)
2. Phase 2 (medium scale)
3. Phase 3 (large scale)

**Good example topics**

* Scaling infrastructure
* Messaging systems

---

## Required output format (structure.md)

When writing `structure.md`, include **only one structure** (the one selected by the user).

The file must follow this format:

# Article Structure

## Introduction

* Narrative goal
* Core insight / pain surfaced

## Section 1 — <working title>

* Reader alignment coverage (which of the 4 questions this section answers)

* High-level description
* Type of reasoning
* Type of code involved (very rough)
* Possible visual

## Section 2 — <working title>

* High-level description
* Type of reasoning
* Type of code involved
* Possible visual

## Section N — <working title>

* High-level description
* Type of reasoning
* Type of code involved
* Possible visual

## Conclusion

* Narrative goal
* CTA direction

## What This Article Does NOT Cover

* Explicitly excluded topics

Do NOT include alternative structures or comparisons in this file.

## Example output
Here is an example of the type of output we expect

```Markdown
# Article Structure

## Introduction
- Present the core insight: concurrency bugs are not about speed, but about shared state.
- Surface the pain: credit inconsistencies caused by simultaneous API requests.
- Explain why this problem matters now (automation + scale).

## Section 1 — The real constraints
- Explain how automated campaigns generate request bursts.
- Clarify why credits behave as shared mutable state.
- Reasoning type: problem framing.
- Code type: credit deduction entry point.
- Possible visual: timeline of overlapping requests.

## Section 2 — Solutions we considered
- Describe the main approaches evaluated (no implementation yet).
- Explain the criteria used to compare them.
- Reasoning type: comparison.
- Code type: transaction handling and locking strategies.
- Possible visual: comparison table of approaches vs constraints.

## Section 3 — Why we chose this approach
- Explain why `SELECT FOR UPDATE` fits the constraints best.
- Highlight trade-offs and accepted limitations.
- Reasoning type: decision under constraints.
- Code type: SQL query + transaction boundary.
- Possible visual: before/after state diagram of credit balance.

## Conclusion
- Summarize the decision and its impact.
- CTA: continue to the next article in the series.

## What This Article Does NOT Cover
- Distributed locking mechanisms.
- Queue-based architectures.
```
