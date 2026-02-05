# Writing Strategies (choose per article)

Different posts need different structures. Before outlining/drafting, pick a strategy.

If the prompt/article request does **not** name a strategy, ask: “Which strategy should we follow for this one: **Narrative Open Loops** or **Claro Cristalino (SEE‑I)**?”

## Strategy A: Narrative Open Loops (incident/series)

Use this for incident writeups and multi-part technical series (hook → investigation → fix), where tension and curiosity are assets.

1) Start in the middle (open loop #1)
- Drop the reader into a concrete moment where something is clearly wrong.
- Show a symptom and a stake, but do not explain the full mechanism yet.
- End the opening with a question or a mismatch that demands an explanation.

2) Rewind to how we got here
- Provide just enough product/system context to make the rest legible.
- Explain the "normal" workflow and the new capability that changed the operating conditions (e.g., integrations, automation, scale).

3) Close loop #1 by naming the real problem
- Make the failure mode explicit (what invariant was broken).
- Use a simple, verifiable example (numbers, expected vs observed behavior).
- Introduce the root cause at a high level (e.g., concurrency/race), but avoid full implementation details.

4) Open loop #2 (the solution hook)
- Tease the approach that will fix it (tests, locking, retries, monitoring), but stop before delivering it.
- End with a clear promise for the next post (what will be built/measured/decided).

## Strategy B: Método Claro Cristalino (SEE‑I) (explainer/clarity)

Use this when the goal is to clarify an idea quickly and make it hard to misunderstand (less “story”, more “teach”).

SEE‑I:
1) **Statement (Dilo):** one crisp claim/idea (brief and direct).
2) **Elaboration (Explica):** rephrase it like you’re explaining to a smart friend who doesn’t know the topic.
3) **Example + counterexample (Ejemplo):** make it concrete; show where it holds and where it doesn’t.
4) **Illustration (Ilustra):** an analogy/metaphor that collapses the concept into an everyday picture.

## Shared rules (both strategies)
- Text must be **self-explanatory**: diagrams/code blocks are complements, not crutches. If someone skim-reads the prose, they should still understand what happens and why it matters.
  - Good: introduce the invariant in plain language, explain each step before/after the diagram, and restate the takeaway after the code block.
  - Bad: drop a big flow chart or SQL snippet and assume the reader will infer the point.
- Always anchor abstract points in an **imaginative, specific scenario** with names and numbers, then keep using it throughout the explanation.
  - Good: “GlowSkin sells face creams. On the customer’s 3rd purchase, Zapier creates a card to mail a thank-you + subscription upsell. A Spain letter costs 3.5 credits; GlowSkin has 100.0 credits; two simultaneous 3rd-purchase events should deduct 7.0 credits.”
  - Bad: “A company has credits and each card costs credits.” (Nobody can simulate this in their head, so they can’t tell if your logic is correct.)
- Delay jargon until the reader has the workflow/invariant in their head.
- Prefer concrete artifacts: one diagram, one table, one "math must hold" example.
- Always include an explicit "expected vs observed" moment when debugging a system.
- Add explicit transitions between sections (especially when switching from story → technical).
- Visuals rule: diagrams/graphs should not contain code; they should use one concrete, specific example (sample entity + numbers) so readers can follow.
