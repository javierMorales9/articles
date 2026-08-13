# When A Next.js Request Stopped Being Enough

## Working Notes

- This is a draft, not final prose.
- Keep Manuscritten as the motivating example, but avoid overfitting the article to its full domain.
- Use only the basic domain needed for the argument:
  - a batch of letters;
  - recipients;
  - postal addresses;
  - address validation;
  - a background job.
- Do not mention campaigns, designs, senders, billing, credits, or other product details unless a later revision explicitly needs them.
- Keep code snippets simplified. They should teach the execution-model shift, not mirror the real code.
- Before final prose, verify current Vercel duration limits from official docs and decide whether the "12 seconds by default" line is framed as historical experience or current fact.

## 1. The Setup That Worked

### Section Review

- Remove any hint that there is already a problem. At this point the article is only establishing the initial state.
- The section should make one idea clear: HTTP servers, and especially serverless apps like a Next.js app deployed on Vercel, are built around short-lived requests.
- Avoid listing Manuscritten-specific product operations unless they are introduced through a concrete example and a code snippet.

### Draft

- Start with the initial state:
  - The whole application lived inside a Next.js app.
  - The frontend was there.
  - The backend was there too.
  - The app was deployed on Vercel.
  - That setup was working well.

- Possible opening beat:

  > At the beginning, the whole application lived inside Next.js. The frontend, the backend, the routes, the small bits of server logic. Everything was in the same place, deployed together, and it worked well.

- Explain why this setup felt natural:
  - One repo/app to run.
  - One deployment path.
  - UI and backend code close together.
  - Easy to move fast while the product was still changing.

- Introduce the kind of work this architecture is great at:
  - receive a request;
  - validate a small payload;
  - make a database read or write;
  - return a response.

- Use a generic example, not a product list:

```ts
export async function updateRecipientAddress(input: UpdateAddressInput) {
  await db.recipients.update({
    id: input.recipientId,
    address: input.address,
    zip: input.zip,
    city: input.city,
  });

  return { ok: true };
}
```

- Explain the serverless/request model plainly:
  - A request comes in.
  - The server does a small piece of work.
  - The server returns.
  - The platform can scale those short executions up and down.

- Main point to land:

  > This is the kind of workload HTTP servers are happy with. Make a small database update and return.

## 2. The CSV Feature That Changed The Shape Of The Problem

### Section Review

- Start with the personal transition requested by the user: not all server work is short-lived, and most applications eventually meet long-running tasks.
- This section now owns the whole first problem: CSV upload, naive endpoint, Google validation, larger batches, and why that does not fit Vercel/serverless.
- Avoid the full Manuscritten domain. The focus entity is a batch of letters created from recipients.
- Keep the Google explanation short. We validate addresses to make sure they are right. No need to explain the obvious shape of the API response.

### Draft

- Opening beat:

  > Unfortunately, not every task a server has to do is a simple short-lived one. Long-running tasks exist too, and most applications eventually have to deal with them. In Manuscritten, we found them pretty early when we started working with CSV uploads.

- Introduce the feature through a concrete situation:
  - Imagine a user wants to create a batch of physical letters.
  - Instead of creating them one by one, they upload a CSV.
  - Each row is one recipient.
  - The server has to turn those rows into letters.

- Example CSV to use:

```csv
name,address,zip,city,country
Ana,Calle Mayor 10,28013,Madrid,ES
Bruno,Via Roma 42,00100,Rome,IT
Carla,221B Baker Street,NW1 6XE,London,GB
```

- Put the naive endpoint here, immediately after the CSV:

```ts
export async function uploadLettersCsv(request: Request) {
  const rows = await parseCsv(request);
  const letters: Letter[] = [];

  for (const row of rows) {
    const recipient = Recipient.fromCsvRow(row);

    await validateRecipientAddress(recipient);

    const letter = Letter.create({ recipient });
    await db.letters.insert(letter);

    letters.push(letter);
  }

  return Response.json({
    created: letters.length,
  });
}
```

- Explain why this endpoint looks reasonable with small files:
  - parse the CSV;
  - create one recipient per row;
  - validate the recipient address;
  - create the letter;
  - save it;
  - return the number of created letters.

- Introduce Google Address Validation:
  - We wanted to validate addresses to make sure they were right.
  - We used Google Address Validation for that.
  - The important operational detail: the app called Google once per recipient.

- Use a deliberately simple function:

```ts
async function validateRecipientAddress(recipient: Recipient) {
  const result = await googleAddressValidation.validate({
    address: recipient.address,
    zip: recipient.zip,
    city: recipient.city,
    country: recipient.country,
  });

  recipient.address = result.normalizedAddress;
  recipient.validated = result.accepted;

  return recipient;
}
```

- Explain when the problem starts:
  - With 100 or 200 letters, this could still feel manageable.
  - The problem started when the app had to manage 500, 1000, or 2000 letters in one upload.
  - In those cases, address validation could take minutes to run.

- Explain why this does not fit Vercel/serverless:
  - The app is deployed as a serverless Next.js app.
  - Serverless functions are optimized for short-running requests.
  - A function should usually do a small amount of work, maybe touch the database, and return.
  - A request that waits for hundreds or thousands of external API calls is fighting that execution model.
  - Before final prose, verify the current Vercel duration limits and decide how to frame the historical "12 seconds by default" detail.

- Add the important nuance: the problem is not only the function duration limit.
  - The task itself does not fit the HTTP request/response shape.
  - The connection with the client stays open during the whole validation process.
  - The client is effectively blocked while the server works through the batch.
  - The endpoint has no good way to tell the client how validation is progressing.
  - The user action is really "start this long-running process", but the endpoint behaves like "wait until this long-running process finishes".

- Keep the lesson simple:

  > The feature looked like "upload a CSV", but the server was really being asked to run a long external validation process before answering.

## 3. The Contract I Actually Wanted

### Section Review

- This section should turn the problem into the new architecture without introducing Graphile yet.
- The output should be a clean, generic contract that could apply to many long-running tasks.
- Include a simplified endpoint showing enqueueing, but keep the queue abstract.

### Draft

- Introduce the new request contract:
  - receive the CSV;
  - parse enough to reject obviously invalid input;
  - create the letter records in a pending/validating state;
  - enqueue address validation;
  - return quickly.

- Simplified endpoint:

```ts
export async function uploadLettersCsv(request: Request) {
  const rows = await parseCsv(request);
  const recipients = rows.map(Recipient.fromCsvRow);

  const batch = await db.transaction(async (tx) => {
    const batch = await tx.letterBatches.create({
      status: "validating",
      total: recipients.length,
    });

    await tx.letters.insertMany(
      recipients.map((recipient) => ({
        batchId: batch.id,
        recipient,
        status: "pending_validation",
      })),
    );

    await queue.enqueue("validate_letter_addresses", {
      batchId: batch.id,
    });

    return batch;
  });

  return Response.json({
    batchId: batch.id,
    status: "validating",
    total: batch.total,
  });
}
```

- Explain what changed:
  - The request no longer owns the whole validation workflow.
  - The request owns intake.
  - The worker owns the slow processing.
  - The database becomes the handoff point between both.

- Show the better boundary:

```text
Better request boundary:

upload CSV
  -> parse rows
  -> create pending letters
  -> enqueue validation job
  -> respond

worker, separately:

pick validation job
  -> validate addresses
  -> update letters
  -> mark batch as ready
```

- Explain the user-facing contract:
  - The upload has been accepted.
  - The batch is validating.
  - Progress can be shown.
  - The user can leave the request behind.

## 4. The Product State That Makes This Honest

### Section Review

- Good place to mention UI progress, but only at the concept level.
- Avoid deep implementation details from the real app.
- This section prevents the architecture from sounding like "just return sooner"; the product still owes the user truth.

### Draft

- Explain that a background job needs visible state.
- If the server returns immediately but the UI pretends the work is complete, the product lies.
- Need states like:
  - `validating`;
  - `ready`;
  - `completed_with_errors` or similar;
  - per-letter `validated`/`invalid` if useful.

- Minimal data model example:

```ts
type LetterBatch = {
  id: string;
  status: "validating" | "ready" | "failed";
  total: number;
  validated: number;
};
```

- Simple progress query:

```ts
export async function getValidationProgress(batchId: string) {
  const total = await db.letters.count({ batchId });
  const validated = await db.letters.count({
    batchId,
    status: "validated",
  });

  return {
    total,
    validated,
    pending: total - validated,
    percent: total === 0 ? 100 : Math.floor((validated / total) * 100),
  };
}
```

- Explain the user experience:
  - The page can show "243 of 1000 addresses validated".
  - The UI can poll every few seconds.
  - When the batch becomes ready, the UI can refresh the letters.

- Key point:

  > Moving the work out of the request did not remove the need to model the work. It made that need more explicit.

## 5. What This Post Is Not Solving Yet

### Section Review

- This closing section should set up the next post without trying to solve the whole series.
- Mention the worker needs shared code, but do not start the monorepo article here.
- Keep the ending crisp.

### Draft

- Summarize where the article arrived:
  - A CSV upload became a long-running workflow.
  - Address validation made the work external and slow.
  - A Next.js request was the wrong lifecycle for the whole process.
  - The new shape is intake now, processing later.

- Then open the next problem:
  - A worker sounds simple until it needs the same rules as the web app.
  - It needs to create/update the same entities.
  - It needs the same database access.
  - It needs the same address validation logic.
  - It needs logging and environment configuration.

- Possible closing beat:

  > The next problem was not choosing a queue. It was making sure the worker would not become a second backend with a slightly different version of the same product rules.

- Transition to post 2:
  - The next post explains the monorepo split.
  - The purpose of the split is to let `apps/web` and `apps/worker` use the same application core.
