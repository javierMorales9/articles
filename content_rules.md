# Content Rules

These rules complement `workflow.md`. They describe editorial patterns to apply when turning research and schemas into drafts or articles.

Use these rules for article substance: structure, examples, context, stakes, and explanation design. For prose voice and sentence-level style, use `style_rules.md`.

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

## Drafts Preserve The Author's Thought Flow

When the user provides a schema, sketch, screenshot, or rough paragraphs for an article, `draft.md` should preserve the author's sequence of reasoning, not merely extract a topic outline from it.

A good draft is a guided proto-article:

- Keep the user's order of ideas unless there is a clear structural problem.
- Reuse and translate the user's rough paragraphs when they express the intended reflection, tone, or transition.
- Add missing connective tissue so the argument reads linearly from one thought to the next.
- Place code snippets, SQL, diagrams, and examples exactly where the reasoning calls for them.
- Prefer paragraph-level draft prose plus local notes over abstract bullets such as "Explain X" or "Mention Y".
- Use bullets only when the final article section itself should likely contain a list, or when capturing options/open questions.

The goal of `draft.md` is not just to remember what the article covers. It should make the intended article almost readable already, while still leaving room for revision before publication.

Bad draft shape:

```text
## Section 1: Hexagonal Architecture

- Explain that each layer has a role.
- Explain that business logic belongs in the domain layer.
- Introduce a Company with id and name.
- Show the companies table.
- Show a controller that changes the company name.
- Explain the repository interface.
- Show the PostgreSQL repository.
```

Why it fails:

- it preserves the topics but not the author's reflection;
- it loses the sequence and cadence of the argument;
- it gives the future writing pass too little prose to work with;
- it makes Codex re-invent the author's tone later instead of preserving it early.

Good draft shape:

````text
If we follow the usual canon around DDD, hexagonal architecture, clean architecture,
or whatever name we want to give this family of ideas, each layer in the application
should have a specific role.

In principle, business logic should live in the domain layer. And by business logic
I mean the code that decides the state our entities should have after something
happens. Infrastructure, on the other hand, should do something much less glamorous:
extract that state from the database and persist it again when the application is
done changing it.

To make this concrete, imagine we have a Company class that represents a company in
our app. A customer, basically. To keep the example small, suppose a company only
has an id and a name.

In the database, that company could live in a table like this:

```sql
create table companies (
  id uuid primary key,
  name text not null
);
```

Now suppose one of the features we allow for a company is changing its name.

At the application boundary, the controller could look like this:

```ts
async function changeCompanyNameController(
  id: string,
  newName: string,
  companyRepo: CompanyRepository,
) {
  const company = await companyRepo.get(id);
  const previousName = company.updateName(newName);

  await companyRepo.save(company);

  return previousName;
}
```
````

Why it works:

- it follows the author's original line of thought;
- it keeps rough but usable article prose;
- it introduces examples at the exact point where the argument needs them;
- it preserves tone while still allowing later polishing.

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

## Explain With Concrete Examples

When an explanation depends on a mechanism the reader may not already understand, include a small example before moving on.

This matters especially for concurrency, load tests, indexes, balances, retries, webhooks, queues, locks, and database transactions. If the reader may ask "how exactly does that work?", answer with a concrete case.

Bad shape:

```text
`iterationInTest` gives a stable global iteration index. That means each iteration can pick one recipient from the read-only recipient list without mutating shared state.
```

Why it fails:

- it names the mechanism but does not show how it behaves;
- it does not explain how virtual users interact with iterations;
- it expects the reader to trust the abstraction instead of seeing it.

Better shape:

```text
Suppose the test has three recipients: Ana, Bruno, and Carla.

The first global iteration uses index 0 and picks Ana. The second uses index 1 and picks Bruno. The third uses index 2 and picks Carla. It does not matter which virtual user runs each iteration. The index belongs to the test run, not to a mutable array shared between virtual users.
```

Rule of thumb: when the article explains a technical tool or pattern, show one tiny input and one tiny output.

## Make Contrasts Visible

When an article depends on a before/after difference, show the practical difference. Do not merely state that the new system improves the old one.

Bad shape:

```text
The API was supposed to remove a very annoying step from our customers' workflow.

Until then, many customers had to upload CSVs when they wanted to create a batch of handwritten letters.
```

Why it fails:

- it says the old workflow was annoying but does not show why;
- it does not make the automation payoff concrete;
- it underplays the operational difference between manual CSV uploads and API-driven workflows.

Better shape:

```text
Until then, many customers had to upload CSVs when they wanted to create a batch of handwritten letters. That meant manual work, formatting mistakes, and one more place where a high-volume workflow could go wrong.

The new API was there to automate that step. Customers could send the letter data directly from the tools that already had it: CRM workflows, ecommerce automations, internal tools, whatever was closest to the customer record.
```

## Use Questions To Move Into Examples

When a section moves from general context into a concrete example, an implicit reader question can make the transition feel natural.

Bad shape:

```text
And yes, I mean real letters. Physical letters. Written by hand, although in our case the hand belongs to a robot.

Imagine an ecommerce company has just launched a new product.
```

Better shape:

```text
And yes, I mean real letters. Physical letters. Written by hand, although in our case the hand belongs to a robot.

In what cases are they useful?

Imagine an ecommerce company has just launched a new product.
```

Use this only when it helps the reader follow the jump. Do not turn every transition into a question.

## Do Not Name Intentionally Omitted Scope

When the article deliberately excludes a concept, implementation branch, subsystem, or edge case, do not call attention to that omission in the prose.

Bad shape:

```text
The real system also has due credits, purchase compensation, and one-time campaigns, but I will not cover those here.
```

Why it fails:

- it distracts the reader with concepts the article will not teach;
- it creates open loops with no payoff;
- it makes the article feel like an internal scope memo instead of a focused technical story.

Better shape:

```text
The test checks one invariant: the company balance after card creation must equal the initial balance minus the cost of the cards created during the run.
```

Rule of thumb: if a detail is out of scope, simply keep it out of the article unless the reader needs it to understand the current argument.
