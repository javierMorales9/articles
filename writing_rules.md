# Writing Rules

These rules complement `workflow.md`. They describe editorial patterns to apply when turning research and schemas into drafts or articles.

## Technical Story, Not Technical Memo

These articles are technical, but they should not read like internal engineering memos.

They are first-person developer stories: something happened, it was confusing or costly, we investigated it, learned the shape of the problem, made tradeoffs, and changed the system.

When drafting, preserve the human and narrative layer:

- what triggered the work;
- what was surprising;
- what the author expected to happen;
- what actually happened;
- what made the problem click;
- why the reader should care before the technical mechanism is fully explained.

The technical explanation still needs to be accurate, but it should arrive through a story rather than a report. Prefer a sequence of lived events over a list of facts when both are possible.

The article should be useful and somewhat entertaining: concrete scenes, stakes, tension, and payoff are part of the work, not decoration.

## Open A Loop Before Context

When an article starts with an incident, bug, or surprising result and then needs to slow down into product or system context, the draft should explicitly open a loop before the context section.

The loop should briefly tell the reader what the article or series will explain, then transition into context.

Use this shape:

```text
In this article/series, I want to unpack:

- the mechanism that caused the failure;
- why it was hard to catch with normal development workflows;
- how we proved it;
- and what we changed afterward.

But before getting into the failure itself, I need to give you a bit of context.
```

Reason: context sections are easier to read when the reader already knows what payoff they are waiting for.

## Prefer Concrete Stakes In The Hook

When the schema includes numbers, keep them in the hook unless there is a factual reason to remove them.

For billing, reliability, performance, or operational stories, translate technical symptoms into stakes:

- money affected;
- user-visible impact;
- time lost;
- number of requests, jobs, records, or retries;
- size of the mismatch.

Approximate numbers are acceptable in drafts when clearly marked as approximate.

## Introduce Situations With Enough Detail

Do not introduce an important situation with a single compressed sentence if the reader needs more context to picture it.

This is especially important when the same situation will be developed a few paragraphs later. A vague early mention creates confusion: the reader sees a phrase, cannot imagine it clearly, moves on, and then has to reconnect it later when the article finally gives the missing details.

Bad shape:

```text
About a week after launching the Manuscritten API, one of our best customers sent a large batch through it.

The API looked fine.
```

Why it fails:

- "sent a large batch through it" is too compressed;
- the reader does not yet know what the API was for;
- the batch matters, but the concrete details arrive later;
- by the time "The API looked fine" appears, the reader may not remember what event is being inspected.

Better shape:

```text
About a week before everything broke, we had launched the Manuscritten API.

That API was supposed to remove a very annoying step from our customers' workflow.

Until then, many customers had to upload CSVs when they wanted to create a batch of handwritten letters. The API would let them do it directly from their own applications: CRM workflows, ecommerce automations, internal tools, whatever already had the customer data.

That was the promise: connect Manuscritten once, then send handwritten letters from the tools they were already using.

Then one of our best customers used it for real.

The API looked fine.
```

Rule of thumb: if a concept needs detail to be understood, either provide the detail immediately or delay the concept until the article is ready to explain it. Do not strand it in a throwaway sentence.
