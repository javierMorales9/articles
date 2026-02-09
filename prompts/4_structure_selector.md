# Prompt 4 — Structure Selector

## Purpose

This prompt explores **multiple possible article structures**, helps the user choose **one**, and then writes **that single chosen structure** to `structure.md`.

Comparison and decision happen first. Persistence to disk happens only **after a structure is selected**.

The structure written to `structure.md` is **high-level and lightweight**. It will be expanded later by another prompt.

---

## What this prompt is NOT allowed to do

* ❌ Write article prose
* ❌ Explain implementation details
* ❌ Turn the article into a generic how-to
* ❌ Repeat the same section list across options

This prompt must **explain structures**, not duplicate templates.

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
* The series context from **index.md** (if part of a series)
* The technical ground truth from **context.md**

If any of these are missing, the agent must ask for them.

---

## Mandatory clarification (ask first)

Before generating `structure.md`, ask up to 4 questions to clarify:

1. Which **type of article** is preferred?

   * Explaining how a problem emerged
   * Revealing a hidden assumption
   * Comparing multiple solutions
   * Describing a decision / epiphany
   * Explaining an evolving process

2. Do you want the article to:

   * Focus on one chosen solution
   * Or strongly compare alternatives

3. Who is the **primary reader**?

   * Senior engineers
   * Product-oriented engineers
   * Generalist developers

4. Primary CTA:

   * Continue the series
   * Invite discussion
   * Soft promotion of services

---

## Structure generation rules

* First, propose **3–5 distinct structures** in chat
* Explain each structure briefly so the user can compare them
* Ask the user to **select exactly one** structure

Only **after a structure is selected**:

* Write a single `structure.md` file
* That file must contain **only the chosen structure**

At this stage the structure is **descriptive, not exhaustive**.

For the chosen structure, include:

* A list of sections
* For each section:

  * High-level description (1–2 lines)
  * Type of reasoning used
  * Type of code that may appear (very rough)
  * Possible visual (if any)

Do NOT include deep detail. Refinement happens in the next prompt.

---

## Canonical article structures

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
