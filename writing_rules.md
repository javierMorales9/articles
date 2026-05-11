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
