# Style Rules

These rules apply to all article work: `series.md`, `draft.md`, and `article.md`. They describe the target voice and the AI-flavored patterns to avoid.

Article material should sound like a real developer explaining a real problem they worked through. The voice should be direct, concrete, first-person, and slightly conversational. Prefer a writer who has opinions, doubts, examples, and scars over a neutral narrator trying to sound polished.

The goal is not to sound informal for its own sake. The goal is to sound specific.

## Cut Padding And Inflated Language

Do not use prestige filler. If a sentence says something is "crucial", "pivotal", "important", or "underscores" something, check whether it actually adds information. In most cases, replace it with the concrete effect.

Avoid phrases like:

- "highlighting the importance of";
- "plays a crucial role in";
- "it is important to remember that";
- "underscores the need for";
- "in today's fast-paced landscape";
- "continues to evolve";
- "has become increasingly important".

Bad shape:

```text
This development highlights the ongoing evolution of the digital landscape and underscores the importance of adaptability in modern business.
```

Better shape:

```text
This changes how small teams compete. They can move faster now.
```

Smart writing is specific, not inflated.

## Vary The Rhythm

Do not make every sentence medium length. Do not make every paragraph the same shape.

Use short sentences when the point should land.

Use longer sentences when the reader needs context, caveats, or a little room before the important part.

Real writing is uneven. Let the rhythm change with the argument.

Starting sentences with "And", "But", or "Like" is allowed when it matches the author's natural voice. Use "I" and "you" naturally. Do not hide every action behind passive voice or third-person abstraction.

Use uncertainty when the author is actually uncertain. "Maybe" and "sometimes" are useful when they are honest. Do not hedge out of habit with phrases like "may potentially", "could possibly", or "is often considered".

## Use Active Voice By Default

Prefer sentences where someone or something does the action.

Bad shape:

```text
The balance was updated after the cards were created.
```

Better shape:

```text
The endpoint created the cards and then updated the balance.
```

Passive voice is allowed when the actor is unknown, irrelevant, or deliberately being hidden for a good reason. Otherwise, use action.

## Kill Meta Commentary

Do not announce the explanation before giving it. Delete section scaffolding unless it creates real narrative tension.

Avoid phrases like:

- "Let's walk through";
- "In this section";
- "Below is a detailed overview";
- "We will explore";
- "It is worth noting";
- "To summarize";
- "In conclusion";
- "Overall".

Bad shape:

```text
Let's walk through how the race condition happened.
```

Better shape:

```text
The endpoint read the company balance before creating the card.
```

If the point is clear, stop. Do not summarize what the reader just read two paragraphs ago.

Also avoid overfitting the user's prompt into the prose. If the user says "write for non-technical people", do not write phrases like "For non-technical people..." into the article unless that phrase naturally belongs there.

## Be Concrete And Opinionated

When the article makes a claim, make it useful. Name the situation where it applies, the tradeoff involved, or the next action the reader should take.

Bad shape:

```text
This approach may potentially offer some benefits for certain organizations.
```

Better shape:

```text
This works for teams under 10 people. Bigger companies will struggle with it because the approval chain gets longer than the workflow itself.
```

Give examples. Real ones when available. Do not rely on abstract platitudes about "strategic thinking", "modern workflows", or "the importance of adaptability".

When explaining a concept, show how it applies. If there is a practical takeaway, make a decision for the reader and explain why.

## Keep The Author Present

Articles should default to first-person voice. That does not mean every paragraph needs "I", but the prose should not sound like a product brochure or a neutral report.

Bad shape:

```text
The main objective was to make handwritten letters work as any other digital marketing channel.
```

Better shape:

```text
We wanted handwritten letters to work like any other marketing channel: we jump into a call with you, help you connect Manuscritten to your workflow, and from that point forward you can send letters to your clients' physical inbox without thinking about it again. That was the theory.
```

Use the author's actual expectations, doubts, mistakes, and reactions when they help the reader understand the story.

## Avoid Brochure Explanations

Do not explain technical decisions with polished abstractions when a concrete reason would do.

Bad shape:

```text
The number is not magic. One VU would be too sequential to reliably trigger the bug. Too many VUs can turn a correctness test into a noisy stress test where timeouts, local machine limits, or unrelated bottlenecks dominate the result.
```

Better shape:

```text
10 VUs is enough to trigger the bug, so there is no need to set up more of them. If you stress the system too much, especially in dev mode or inside a test harness, you can make other parts fail first: database connections, memory, server timeouts. Then the test stops telling you whether the race condition is fixed.
```

Rule of thumb: replace abstract justification with the actual number, failure mode, or tradeoff.

## Remove Ornamental Jokes

Humor is welcome when it reveals the author's voice or sharpens the point. Remove jokes that only decorate a sentence.

Bad shape:

```text
Your first solution technically works, but it is slow. Or ugly. Or slow and ugly, which is a beautiful little genre of software.
```

Better shape:

```text
Your first solution technically works, but it is painfully slow.
```

## Avoid Filler Repetition

Repetition can create rhythm, but AI often uses it as filler.

Watch for patterns like:

- "It can... It can... It can...";
- "You do X. You do Y. You do Z.";
- "If you opened... If you inspected... If you looked...".

If the repetition does not add deliberate emphasis, compress it or vary the structure.

Bad shape:

```text
The worst part of this bug was that the individual records looked fine.

If you opened the admin panel, the letters were there.

If you inspected the addresses, they were there.

If you looked for request failures, there was nothing obvious.
```

Better shape:

```text
The worst part of this bug was that the individual records looked fine. The letters existed, their addresses were in place, and there were no obvious request failures.
```

## Avoid Formulaic Insight Shapes

Some sentence shapes sound deep because they have a familiar rhythm. Most of the time, they hide a generic point.

If article prose contains one of these shapes, rewrite it unless the article has a very specific reason to keep it.

| Pattern | Shape | Problem |
| --- | --- | --- |
| Era drama | "In a world where X, Y becomes Z." | Turns a concrete explanation into cinematic grandiosity. |
| Winner/loser split | "Most people X. The few who win Y." | Moralizes and overgeneralizes. |
| Binary command | "Stop doing X. Start doing Y." | Deletes nuance and sounds like self-help filler. |
| Triple contrast | "It is not X. It is not Y. It is Z." | Creates fake depth with rhythm. |
| FOMO threat | "If you are not doing X, you are already behind." | Pressures the reader instead of explaining the mechanism. |
| Real-work reveal | "The real work is not X. It is Y." | Pretends to reveal something while staying abstract. |
| Minimalist smack | "You do not need more X. You need Y." | Sounds decisive while often saying little. |
| Easy/hard paradox | "It has never been easier to X. It has never been harder to Y." | Makes exaggerated era claims. |
| Fake reveal | "Here is the truth..." or "What nobody tells you..." | Announces depth before saying something generic. |

Rewrite toward:

- the concrete situation;
- the mechanism that caused the problem;
- the tradeoff involved;
- the example that makes the point visible;
- or the author's actual reaction.

Bad shape:

```text
The real AI work is not typing prompts. It is deciding which answers to keep.
```

Better shape:

```text
The prompt was not the part that saved time. The useful part was comparing three candidate explanations against the actual code path and deleting the two that sounded reasonable but did not match how the endpoint worked.
```

## Avoid Formulaic Negative Epiphanies

Do not build tension with the stock pattern where everything looks simple and then complexity suddenly appears.

Bad shape:

```text
At first the flow seems straightforward: create a checkout session, receive a webhook, update the user's subscription.

Then you start implementing it and the real problem appears.
```

Better shape:

```text
The flow has three visible steps: create a checkout session, receive a webhook, update the user's subscription. The awkward part is that webhooks can be duplicated, arrive out of order, or retry after a partial failure.
```

Prefer exposing the technical conflict directly. If there is a personal realization, make it specific to the real work instead of using a generic "then I remembered complexity exists" turn.

## Avoid Moralizing Closers

Delete closing sentences that merely underline the point with a moral.

Bad shape:

```text
The bug only appears when multiple successful operations overlap in time and mutate the same accounting state.

That is exactly what real customers do once you give them an API.
```

Better shape:

```text
The bug only appears when multiple successful operations overlap in time and mutate the same accounting state.
```

If the sentence does not add information, an example, a decision, or a consequence, remove it.

## Final Article Revision Checklist

Before accepting article material, scan for:

- abstract explanations without concrete examples;
- corporate or product-brochure tone;
- inflated phrases that could be replaced with a concrete effect;
- repeated sentence openings used as filler;
- sentences and paragraphs that all have the same rhythm;
- passive voice where active voice would be clearer;
- "not X but Y" constructions;
- "at first simple, then hard" mini-dramas;
- "obvious but important" paragraphs;
- LinkedIn-style insight templates;
- meta commentary that announces the explanation;
- closing moral sentences that only underline the point.

Ask:

- Does this sound like someone who actually did the work?
- Did I give the reader an example, decision, or practical next step?
- Did I summarize after the point was already clear?
