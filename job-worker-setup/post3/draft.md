# How To Implement A Background Job Queue With Postgres

## Introduction

### Section Review

- The section should connect clearly with posts 1 and 2 without spending too long recapping them.
- The title still needs a final pass. "Postgres" should probably stay in the headline because it is the practical hook, but the article should not sound like a generic Postgres-for-everything manifesto.
- The worker loop from post 2 should be reused, but shortened if the final article feels repetitive.

### Draft

This post is the third and final part of the series about introducing a worker into a normal Node.js application.

In the first post we discussed how long running tasks forces us to introduce a worker.

And in the second one we saw how to turn your NodeJS backend into a monorepo to acommodate the new worker

In this third and final post we are going to look at how to actually implement a worker.

As we discussed in the second post of this series, the arquitecture of a worker is pretty simple. 

The worker is idle by default and listening to a queue. When a new job event comes through, the worker determines its type and dispatch the correct handler to manage it. After the handler is done it sets the job as finished.

Something like this:

```ts
while (workerIsRunning) {
  const job = await queue.getNextJob();

  if (!job) {
    await sleep();
    continue;
  }

  const handler = handlers[job.type];

  try {
    await handler(job.payload);
    await queue.markAsCompleted(job.id);
  } catch (error) {
    await queue.markAsFailed(job.id, error);
  }
}
```

As I said, my idea with this article is to share how we build the worker four app, Manuscritten, and the difference tradeoffs we had to consider while building it. The most important one of these tradeoffs is actually not about the worker itself but about the queue. 

## Setting up the queue

### Section Review

- This section needs to be opinionated but not absolutist. The point is "Postgres was enough for this product and team", not "every queue should be Postgres forever."
- The external "just use Postgres" links from the schema are useful as research/context links, but the final article should not depend on them too heavily.
- The tradeoff list should stay concrete: polling cost, feature gaps, operational overhead, and observability.

### Draft

The worker is only half of the story. A worker needs somewhere to get work from.

You have probably seen a lot of options for this: RabbitMQ, Kafka, ActiveMQ, Celery, AWS SQS, and a long list of managed queue services.

The good thing about them is that they are designed especifically to deal with this use case so they are probably the right decision to pick if you have to manage high throughput, many producers and consumers, routing rules, dead-letter workflows, multiple independent teams that have to communicate through events.

Of course, they also have great cost. It is an additional service you have to deploy and monitor. It also complicates the dev environment and obligues developers to learn a new query language and API.

If you have a small team, like ours at Manuscritten, most of the features of ad-hoc queues are an overkill, and the cost of managing the additional service tends to be greater than the advantages.

Fortunately, there was another way to setup the queue: we [could](https://www.amazingcto.com/postgres-for-everything/) [just](https://www.tigerdata.com/blog/its-2026-just-use-postgres) [use](https://www.justfuckingusepostgres.com/) [Postgres](https://mccue.dev/pages/8-16-24-just-use-postgres).

Make sense right, why use an external service if we could just use the database (that we were already using)?

Well, it turns out that we can actually use Postgres for this.

The first half of the queu, the producer side, is actually pretty simple to implement. We can just have a Job table and add a new row to that table every time we want to create a new job.

*Note: This approach has an extra advantage: it allow us to create the jobs in the same transaction we were already doing the work. That way, if the transaction rollbacks we are sure that we are not going to have a danglig job. And viceversa, if the job creation fails the transaction will be rollbacked, so we ensure there won't be unprocessed data in the DB.*

The hard part is actually in the second half, the consumer side. For mainly two reasons:
1. Concurrency: If we have multiple workers how do we ensure that the events will be processed just once? How do we avoid to workers from processing the same job?
2. Job dispatching: In normal queues, the worker does not have to poll constantly to check if there is more work to process. Tipically the event is sent proactively by the queue to avoid extra load.

To handle this two problems, Postgres offers two features: `SKIP LOCKED` and `LISTEN` / `NOTIFY`. (See: [ref1](https://web.archive.org/web/20240309030618/https://www.2ndquadrant.com/en/blog/what-is-select-skip-locked-for-in-postgresql-9-5/), [ref2](https://neon.com/guides/queue-system))

`SKIP LOCKED` lets multiple workers look for pending jobs without fighting over the same row. A worker can lock one job, and another worker can skip that locked row and take the next one.

A simplified version looks like this:

```sql
select id, task_identifier, payload
from jobs
where run_at <= now()
order by priority, run_at
for update skip locked
limit 1;
```

That query says: *give me one job that is ready to run, lock it for this transaction, and do not wait on rows another worker already locked*. 

The way it works internally is that the select will take the first row that matches the filter. If it is not locked by other transaction it will return it(and adquire a row level lock with for update). And it is already locked it will keep checking rows one by one until it finds one that is not locked.

`LISTEN` / `NOTIFY` can be used to wake workers when new jobs arrive instead of relying only on polling ([ref](https://oneuptime.com/blog/post/2026-01-25-use-listen-notify-real-time-postgresql/view)).

You could actually implement a queue using this two features ([ex1](https://aminediro.com/posts/pg_job_queue/), [ex2](https://medium.com/@the_atomic_architect/postgresql-replaced-my-message-queue-and-taught-me-skip-locked-along-the-way-87d59e5b9525)), in fact a simple queue can be implemented easily.

The problem is that you will also have to implement yourself most of the features that standard queues come with: retries (with exponential backoff), delayed jobs, scheduled jobs (cronjobs), cancellation, dead letter queues, etc.

So, in our case, instead of doing all of this work ourselves, we decided to use a framework that already knew how to do that part.

There are a bunch of alternatives for this. For example, [pgmq](https://github.com/pgmq/pgmq) is an extension that allows you to manage your queue (create jobs, extract them, etc.) directly inside postgres.

But we decied to choose [Graphile Worker](https://worker.graphile.org/) because it gaves us a convenient NodeJS SDK both for the app (pushing jobs) and for the worker (consuming them).

Now, lets get our hands dirty and implement the worker using Graphile.

## Setting Up The Worker Project

### Section Review

- This section should stay close to actual Manuscritten files: `apps/worker/package.json`, `src/index.ts`, `src/graphile.ts`, and the task map.
- The schema asks to "show how to install Graphile"; because the repo already has the package installed, the draft should show the dependency and command shape rather than pretending to run a fresh tutorial from scratch.
- Avoid logging/observability detail here. Mention that the real file starts telemetry, but keep the explanation focused on Graphile startup.

### Draft

In the previous post we left with an empty project for the worker that lived in `apps/worker`.

```text
my-app/
  apps/
    backend/
    worker/
      src/
        index.ts
      package.json
      tsconfig.json

  packages/
    domain/
    db/

  package.json
```

At this point the worker it is just an index.ts with a hello world print. So, before anything else, let's install Graphile worker in `package.json`.
```bash
npm install -w apps/worker graphile-worker
```

Now, we can initialize the Graphile worker like this.

```ts
import { parseCronItems, run, runMigrations, type Runner } from "graphile-worker";
import { JobType } from "@my-app/domain/shared/Job";
import type { TaskList } from "graphile-worker";
//Note that because of the typescript config that we established in the previous
//article we need to import with .js, even though, as we will see, we will write
//validateCards in typescript.
import { validateCardsTask } from "./validateCards.js";

let runner: Runner | null = null;

async function main(): Promise<void> {
  process.title = "manus-worker";
  setupGracefulShutdown();
  await startGraphileWorker();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

const tasks: TaskList = {
  [JobType.VALIDATE_CARDS]: async (payload) => {
    await validateCardsTask(payload);
  },
};

async function startGraphileWorker(): Promise<Runner> {
  await runMigrations({
    connectionString: process.env.DATABASE_URL
  });

  runner = await run(
    {
      connectionString: process.env.DATABASE_URL,
      concurrency: process.env.WORKER_CONCURRENCY ?? 5,
      pollInterval: process.env.WORKER_POLL_INTERVAL_MS ?? 1000,
      noPreparedStatements: false,
    },
    tasks,
  );

  return runner;
}

export function setupGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    try {
      await stopGraphileWorker();
      process.exit(0);
    } catch (error) {
      process.exit(1);
    }
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}
```

The first thing the startup function does it to run the Graphile Worker migrations to make sure the database schema is up to date with the framework ([ref](https://worker.graphile.org/docs/schema)).

Then it starts server and sets up some configuration. `concurrency` specifies the number of concurrent jobs that can be executed. Internally, Graphile has pool of workers so that, when a new job comes, it automatically get assigned to an idle worker. If there is no idle worker it will just discard it (release the lock). Then when one worker finish its job, Graphile will poll the database for a pending work. And that's what the `pollInterval` is there for.

The `tasks` specify the different event types that the worker can process and the handler associated with each one. `JobType` is just an enum of types:

```ts
export enum JobType {
  VALIDATE_CARDS = "validate_cards",
  //...other job types
}
```

## Writing The `validate_cards` Task

### Section Review

- This is the main technical section. It should explain the card validation state clearly: campaign starts with `validatingCards = true`; cards start with `validated = false`; the task flips card state and eventually finishes campaign validation.
- Keep snippets small. The real task is large because it handles repositories, design lookups, company pricing, lock retries, and failure cases.
- The article should include why chunks exist: they keep each DB read bounded and let the task make progress through large campaigns.

### Draft

In the example we have given you can see we have just one task (job event), `validate_cards`. As we commented in previous posts, this is the google map address validation process we extracted from our endpoint.

This task will live in another file, `validateCards.ts`
```text
my-app/
  apps/
    backend/
    worker/
      src/
        index.ts
        validateCards.ts
      package.json
      tsconfig.json

  packages/
    domain/
    db/

  package.json
```

I personally like to write this tasks this way:

```ts
//We import the campaign from the package.
import { Campaign } from "@my-app/domain/Campaign";

const CHUNK_SIZE = process.env.WORKER_CHUNK_SIZE ?? 50;

export async function validateCardsTask(payload: unknown, db: Db): Promise<void> {
  const job = Job.fromGraphilePayload(payload);

  if (!job.campaignId) {
    throw new Error("validate_cards job missing campaignId");
  }

  const recipientRepo = new RecipientRepository(db);
  const campaignRepo = new CampaignRepository(db);

  const campaign = campaignRepo.find(job.campaignId);

  while (true) {
    const recipientsBatch = await recipientRepo.getCardsToValidate(
      job.campaignId,
      CHUNK_SIZE,
    );

    if (recipientsBatch.length === 0) {
      break;
    }

    for (const rec of recipientsBatch) {
      try {
        //validateRecipientWitGoogle just take the recipient, sends it to google
        //to check if the address exists, and update the recipient in place 
        //with the actual data
        await validateRecipientWitGoogle(rec);
        campaign.recipientValidated();
      } catch(e) {
        campaign.recipientValidationFailed();
      }
    }

    await db.transaction(async (tx) => {
      recipientRepo.setDb(tx);
      await recipientRepo.updateMultiple(recipientsBatch);
      // We update the progress fields in the campaign
      // so the frontend can track the progress
      await campaignRepo.save(campaign);
    });
  }
  
  await db.transaction(async (tx) => {
    campaign.finishValidation();
    await campaignRepo.save(campaign);
  });
}
```

As you can see, the task works in batches. In general is preferable to work in fixed size batches than dealing with all elements (recipients in this case) at once.

The first reason to do it this ways is that backes avoid having to start from the beginning if the task fails at some point.

Let's imagine that we have 200 addresses to validate and we work on batches of 50 addresses. Let's also say that the address validation for the recipient number 156 fails because the google api gives an error.

In that case, the job will be marked as failed. And graphile worker will retry it a few seconds later. In the retry we will not start to revalidate from recipient 0. We will start directly from recipient 151 because the first three batches of 50 recipient have been already validated.

Batches also allow us to update the validation state of the campaign so that the frontend can track the progress. So, in this case, you can see that, after every successfull/failed recipient validation we update the progress in the campaign. 

```ts
class Campaign {
  constructor(
    public id: string,
    public status: "validating" | "ready" | "failed",
    public total: number,
    public validated: number,
    public error: nuber,
    //...other fields
  ) {}

  recipientValidated() {
    this.validated += 1;
  }

  recipientValidationFailed() {
    this.error += 1;
  }

  finishValidation() {
    this.status = "ready";
  }
}
```

And then we update the campaign in the Db with the rest of the batch.

When all recipients have been validated we set the campaign as ready and Graphile will take care of marking the job as finished.

## Enqueuing The Job From The Web App

### Section Review

- The user's schema asks to show the client/web creation without extra classes and "just do the SQL in place." The actual Manuscritten code wraps Graphile in `GraphileJobEnqueuer`, but the draft can show both: direct SQL as the concept, then the adapter as the codebase's local choice.
- This section should tie back to post 1's pseudocode and show that the request returns after enqueueing.
- Be careful with "client": the job is created by the backend mutation called by the UI, not by browser code directly.

### Draft

Now that we have seen how the job processing is handled in the worker, let's see how we can enqueue new jobs from the backend.

Graphile gives us a `graphile_worker.add_job` ([ref](https://worker.graphile.org/docs/sql-add-job#graphile_workeradd_job)) that we can use to create a new job. 

That we can use this way:
```ts
router.post("/campaign", async (req, res) => {
  const rows = await parseCsv(req);
  const campaign = new Campaign(...);
  const recipients: Recipient[] = [];

  for (const row of rows) {
    const recipient = Recipient.fromCsvRow(row, campaign.id);
    recipients.push(recipient);
  }

  // We create a jobKey to track the job in the db.
  // Should be looged (here emitted) for debugging.
  const jobKey = `${campaign.id}-validate-recipients`;
  const job = {
    jobKey,
    type: JobType.CARD_CREATED_SIDE_EFFECTS,
    payload: {
      source: "/campaign",
      cardId: card.id,
      cardOrigin: card.origin,
      cardCreatedAt: card.createdAt.toISOString(),
      owedTransitionedNow: false,
    }
  };

  await req.ctx.db.transaction(async (tx) => {
    await saveCampaign(tx, campaign);
    await saveRecipients(tx, recipients);
    await this.db.execute(sql`
      SELECT graphile_worker.add_job(
        ${job.type},
        ${JSON.stringify(job)}::json,
        null,
        null,
        null,
        ${opts?.jobKey},
        null,
        null
      )
    `);
  });

  return res.json({
    created: recipients.length,
  });
});
```

The are three main elements in the `graphile_worker.add_job` call:
1. The job type. It will be used us to idetify the corresponding handler when the worker starts to process this job.
2. The jobKey: Is just a way to be able to track where the job of an specific campaign is. It is useful for debuggin when the validation goes wrong for example. It sould be logged.
3. The payload: This is a json blob column that will contain the job-specific items that the handler will use. You can store what you want here. Each endpoint will have different values here.

There a bunch of other things you can set up: run_at (if you want to make sure that the job wont start befor an specific date), max_attempts (you can set it to 1 to make sure it just runs one time even if it fails), priority, queue name, etc. Consult the documentation if you are interested in any of those.

## Building And Running The Worker

### Section Review

- The schema asks for build process and Dockerfile. This section should show enough concrete setup to make the worker feel deployable, but not become a Docker tutorial.
- Mention `tsup` because Manuscritten uses it to bundle the worker.
- The Dockerfile excerpt should be shortened from the real file.

### Draft

For local development, the worker can be run just by compiling from `src/index` with `tsx`:

```bash
npx tsx src/index.ts
```

For production, we need to compile the typescript and generate a final js distribution.

I personally like to use [tsup](https://tsup.egoist.dev/) for bundling the code. We can simply build our code by creating a `apps/worker/tsup.config.ts` fine that does something like this:

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  target: "node20",
  outDir: "dist",
  sourcemap: true,
  clean: true,
  bundle: true,
  noExternal: [/^@my-app\//],
});
```

It's important to note setting is `noExternal: [/^@my-app\//]`.

The worker imports internal packages like `@my-app/db` and `@my-app/domain`. Bundling those internal packages into the worker output makes the runtime container simpler, because the worker does not need to resolve the monorepo source tree at runtime.

Then we can just call tsup as build script and it will automatically build everything into the `apps/worker/dist/` folder.
```json
{
  ... rest of package.json
  "scripts": {
    "build": "tsup",
    "start": "node --enable-source-maps dist/index.cjs"
  }
}
```

We can also create a Dockerfile for deploying the worker. 

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY apps/worker/package*.json apps/worker/
COPY packages/db/package.json packages/db/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/env/package.json packages/env/package.json
COPY packages/logger/package.json packages/logger/package.json

RUN npm i -g npm@11
RUN npm install --workspaces --include-workspace-root

COPY . .
RUN npm run -w @my-app/worker build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/worker/dist ./dist
COPY --from=builder /app/packages/db/migrations ./packages/db/migrations

CMD ["node", "--enable-source-maps", "dist/index.cjs"]
```
The Dockerfile is a normal two-stage build.
- The builder installs workspace dependencies and builds only the worker
- The runner copies the built file and starts it

Now you can take this Dockerfile and deploy it wherever you want.

## Next Steps

### Section Review

- This section should not reopen too much. It should briefly point to production concerns that deserve their own articles.
- The schema asks for failed jobs, observability, and concurrency. Keep those as future topics rather than implementing them here.
- The final article can either keep this as a short closing section or merge it with "What This Bought Us."

### Draft

In this post I have shares what my approach to developing workers is. And spececifically I wanted to mention out the convenience of just using your current database (in this case Postgres) as a queue for job events. 

In a real production workflow, however, you would probably need to handle more things that this post leaves out. Mainly three: managing of failed jobs, concurrency and observability.

Failed jobs are the first one. Graphile Worker already handles retries, which is a good start. But retries are not the whole story. Sometimes failed job required more work:
- How can you store this permanently failed jobs for later reviewing
- How can you monitor them so a person gets notified of them.
- If a user is waiting for that job to finish (addresses validation is a good case about it), How can you inform the user that its job failed?
- How can you design your products around this failures?
- How can you handle failed jobs that does things that should not be retried (sending emails which can be duplicate, money things, etc.)?

You will also need to deal with issues derived from increasing load and concurrent transactions, issues like:
- How many jobs can one worker run at the same time? Should you scale one worker vertically, by giving it more CPU and higher concurrency, or horizontally, by running more worker instances?
- How do you simulate load without accidentally testing Google rate limits instead of your own worker?
- How can you avoid excesive locking in the db by your long running transactions?

And of course, everyone favourit topic: Observability. First, I've found that logging for workers requires more thinking. In our particular example (address validation) how many times should we log: Once per validation? Once per batch? Just one log for the whole worker in an observability 2.0 style? There are different tradeoffs for different options and its not trivial to choose one. Besides this, in workers I find that is very important to track metrics related to the queue. Things like:
- time spent waiting in the queue;
- pending queue depth;
- running jobs;
- failed jobs;
- retry counts;
- average task duration;
- provider failures.

This require observing the related tables periodically, which can have some performance impact and is also not trivial to implement.

In sum, I feel that besides the fundamental architecture exposed in this article is key to manage all this three extra topics.

Which I hope I will be able to cover in future future articles.

Until then, see you around.