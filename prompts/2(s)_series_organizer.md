# Prompt 2 — Series Structure & Pain Mapping

## Purpose

This prompt is used **only when Prompt 1 has decided that the work should be a SERIES**.

Its goal is **not** to define article structure, sections, or emphasis.

Its sole responsibility is to:

> **Design the structure of the series at the level of articles**, ensuring that:
>
> * Each article is worth clicking and reading on its own
> * Each article is anchored in a clear *pain, risk, or uncomfortable truth*
> * The series as a whole feels cohesive and inevitable

The output of this prompt must be saved as:

> **`index.md`**

inside the series folder.

This prompt operates at the level of **titles, pains, and promises**, not implementation.

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

* The output of the **Editorial Router** (1_editorial_router.md)

Code access is **not required** at this stage.

---

## Core responsibility

The agent must:

1. Identify the **core pain or risk** that unifies the entire series
2. Break that pain into **distinct, standalone pains**
3. Map each pain to a **single article**
4. Ensure each article can be read independently

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

Rules:
- Do NOT write article outlines or sections
- Do NOT explain solutions
- Do NOT turn articles into how-tos
- Each article must be valuable if read in isolation

Start by asking clarification questions (max 4 at a time) if needed.

---

### REQUIRED OUTPUT STRUCTURE

# Series Structure

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
- Optional: high-level actionable direction (only as a response to the pain, not a how-to)

## 3. Series coherence
- How the articles relate to each other
- Why reading more than one compounds value

## 4. Editorial guardrails
- Topics explicitly excluded from the series
- Types of articles this series must NOT become (e.g. generic how-tos, tip lists without a trigger)

## 5. Next steps
- Which article should be written first
- Which prompt to run next for that article
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
