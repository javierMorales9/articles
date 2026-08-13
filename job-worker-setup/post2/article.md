# How I Turn My Normal App Into A Monorepo

![image](header_image.png)

## The Worker Could Not Be A Copy Of The Backend

In the previous post, we look at the moment when a normal API endpoint stops being a good place for a piece of work.

We saw an example I found in my app were we had to validate a bunch of addresses using google maps and found that, if the number of addresses were large, we would end up taking minutes to comple the operation. This made the situation unbearable for the api endpoint (imagine a user waiting 3 minutes for an petition to return) and we decided we needed a worker.

By worker, of course we meant an extra service, running in a differente process / machine / docker container than the app and suited with handling long running tasks (validating 1000 addresses against the Google API for example).

The app and the worker will comunicate with eachother through a queu of some kind.By default the worker is idle, waiting for new jobs to handle. When the app want the worker to do some work emits a new event through the queue. The worker will pick this event, detect its type, and execute the correct code to handle it. Something like this:

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

If we go back to our address validation example, the worker receives a job saying: validate the recipients for this campaign. And the worker will call an specific handler function to manage it:

```ts
async function validateCampaignRecipientsJob(payload: {
  campaignId: string;
}) {
  const campaign = await campaignRepository.findById(payload.campaignId);
  const recipients = await recipientRepo.getCardsToValidate(payload.campaignId);

  const validatedRecipients: Recipient[] = [];
  for (const recipient of recipients) {
    try {
      await validateRecipientWitGoogle(rec);
      campaign.recipientValidated();
    } catch(e) {
      campaign.recipientValidationFailed();
    }

    recipients.push(recipient);
  }
  
  await req.ctx.db.transaction(async (tx) => {
    await campaignRepository.save(tx, campaign);
    await recipientRepository.saveMultiple(tx, recipients);
  });
}
```

If you remember the previous article, this code looks pretty similar to the code we naivle do in the first implementation we did inside the endpoint. It first loads a campaign and its recipients from the database. Then it passes each recipient to the google validator and update the counters of the campaign (see also previous post) in the process. And finally it saves all the updated records back to the database.

What is important to note here is that, even though the endpoint lives outside of the app, it shares the same entities that the app endpoint uses. It deals with domain classes (recipients and campaigns) that has their internal domain rules, it access to the same database using repositories and probably it also uses the same function to access the google services.

This makes total sense if we take into consdieration that this validation task is work we extracted from the main server. So of course it's going to share most of the elements that compose a normal endoint. The worker is just a second runtime for the same application.

The thing with this fact is that it, apparently, contradicts with a previous point we made: That the worker runs in its own process / machine / docker container and that it will probably uses a different build process, runtime (node vs bun for example), framework, dependencies, etc.

Of course, we could reimplement all of this work in the worker. We could just copy and paste the domain and db elements inside the worker codebase and start using it. The problem with that approach is that we will end up having two different versions of the same objects. Which will drift with time if we don't manage it carfully. And although this might make sense in some cases (see [Boundary context](https://martinfowler.com/bliki/BoundedContext.html) in DDD), is probably a bad decision for a small team that plan to manage both of them.

In my opinion it makes much more sense to make both of the services share the same core elements.

That is the reason this chapter is not about building the worker yet (we will tacke this in the next one) but about refactoring our current NodeJS app to create room for the worker.

And we will achieve that through monorepos.

## What Is A Monorepo?


Before doing anything, the application looks like this:

```text
my-app/
  src/
    index.ts
    routes/
      campaign.route.ts
    db/
      db.ts
      repositories/
        campaign.repository.ts
        recipient.repository.ts
    domain/
      Campaign.ts
      Recipient.ts
    env.ts
    logger.ts
  package.json
```

The backend routes under `src/routes` imports the domain classes from `src/domain`. The repositories that access the db live under `src/db`.

The problem appears when a second runtime enters the picture.

If I were to create a worker next to that app, like
```text
my-app/
  app/
    src/
      ...
  worker/
    ...
```

the worker cannot easily import elements from `src/domain/` or `src/db/` as stable dependencies since they are just internal files of the backend app.

Node gives us a practical tool for this kind of split: npm workspaces.

The npm docs describe workspaces as a set of CLI features for managing multiple packages from the local filesystem inside one top-level package. In practice, that means I can keep several `package.json` files in the same repository and have npm link those local packages together during `npm install`.

This paragraph is hard to digest, so let's go step by step.

Normally, when we think about dependencies in a Node app, we think about packages installed from the npm registry:

```json
{
  "dependencies": {
    "zod": "^3.23.8",
    "drizzle-orm": "^0.44.7"
  }
}
```

Those are external dependencies. They come from outside the repository.

With workspaces, we can also have **internal dependencies**: packages that belong to the same project, live in the same repository, and are not meant to be installed from the public registry.

The idea is to turn our app into a collection of packages. So we will packages for our main runtimes: backend and worker and then secondary packages for the shared parts: domain, db, etc.

So, for example, this is how our app would look like if we extracted db and domain as independent packages.

```text
my-app/
  app/
    src/
      index.ts
      routes/
        campaign.route.ts
    package.json

  db/
    db.ts
    repositories/
      campaign.repository.ts
      recipient.repository.ts
    package.json

  domain/
    Campaign.ts
    Recipient.ts
    package.json

  package.json
```

As you can see, db and domain are now independent package with their own package.json. Each one of this packages will have a name, `@my-app/domain` and `@my-app/db` for example.

Then the app, that is just a another normal package, will then import both of them and use them.

```json
{
  "dependencies": {
    "@my-app/domain": "*",
    "@my-app/db": "*"
  }
}
```

From the backend's point of view, `@my-app/domain` behaves like a package.

The difference is that npm does not download it from the registry. It finds it inside the repository, links it into `node_modules`, and lets the app import from it like any other dependency.

With a setup like this, to add the worker we just have to create another package for it and we can just reuse the domain and db directly. For the rest of the series we are going to assume we work with a setup like this:

```text
my-app/
  apps/
    backend/
      src/
        index.ts
        routes/
          campaign.route.ts
      package.json

    worker/
      src/
        tasks/
          validate-recipients.ts
        index.ts
      package.json

  packages/
    db/
      db.ts
      repositories/
        campaign.repository.ts
        recipient.repository.ts
      package.json

    domain/
      Campaign.ts
      Recipient.ts
      package.json

  package.json
```

Where as you can see we have moved the db and domain packages under `packages/` and have the backend and the worker under `apps/`. From the npm point of view there is no real difference between them. It is just a logical difference we make to know which ones consitute real services and which ones are just shared utilities. 

Ok, this is basically our objective. What we are going to do now is to show step by step how to make the refactor from the initial version to the last version. And we will start by extracting the `db` and `domain`.

## Extracting The Shared Dependencies


Ok, so let's go back to the initial version and start working from here:

```text
my-app/
  src/
    index.ts
    routes/
      campaign.route.ts
    db/
      db.ts
      repositories/
        campaign.repository.ts
        recipient.repository.ts
    domain/
      Campaign.ts
      Recipient.ts
    env.ts
    logger.ts
  package.json
  tsconfig.json
```

The first move I am going to make is to move all the files inside `my-app` into an `apps/backend` folder and define a root package.json:

```text
my-app/
  apps/
    backend/
      src/
        index.ts
        routes/
          campaign.route.ts
        db/
          db.ts
          repositories/
            campaign.repository.ts
            recipient.repository.ts
        domain/
          Campaign.ts
          Recipient.ts
        env.ts
        logger.ts
      package.json
      tsconfig.json
  package.json
```

This root `package.json` is the workspace coordinator that will define where the different packages (workspaces) live.
```json
{
  "name": "manuscritten-monorepo",
  "private": true,
  "type": "module",
  "workspaces": ["apps/*"],
  "scripts": {
    ...
  }
}
```

The important line is this one:

```json
{
  "workspaces": ["apps/*"]
}
```

That tells npm that every folder under `apps/` can be a package managed from the root.

The previous package.json now belongs to the backend package `apps/backend/package.json` and can still be the same. The only thing we have to do its add it a name like `@my-app/backend`:

```json
{
  "name": "@my-app/backend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "express": "^4.18.3",
    "drizzle-orm": "^0.44.7",
    "zod": "^3.23.3"
  },
  ... the rest of things it currently had
}
```

The `@my-app` part is the package scope. You can call it whatever makes sense for your project or no scope at all.

The second part, `backend`, is the package name inside that scope.

So `@my-app/backend` means: the backend package that belongs to my app workspace.

For now, this does not change the application behavior. It only lets the backend live as a package inside the workspace. At this point, the code is still coupled to the backend app.

So, in `apps/backend/src/routes/campaign.route.ts` we still are importing the domain and db from the local package.

```ts
import express from "express";

import { Campaign } from "../domain/Campaign";
import { Recipient } from "../domain/Recipient";

import { CampaignRepository } from "../db/repositories/campaign.repository";
import { RecipientRepository } from "../db/repositories/recipient.repository";

//...Rest of the code for the router.
```

Let's now see how we can extract this elements from the backend and move it in their own pacakges.

First let's create a `packages/` folder and update the root workspace config to include shared packages too:

```json
{
  "name": "manuscritten-monorepo",
  "private": true,
  "type": "module",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev:backend": "npm run -w apps/backend dev",
    "build:backend": "npm run -w apps/backend build",
    "typecheck": "npm run -ws typecheck"
  }
}
```

Then let's move all the domain classes that were present under `apps/backend/src/domain` and move them inside a `packages/domain` folder. We will also need to create a `package.json` and a `tsconfig.json` inside this new package.

```text
packages/
  domain/
    Campaign.ts
    Recipient.ts
    package.json
    tsconfig.json
```

The `packages/domain/package.json` will look like this:

```json
{
  "name": "@my-app/domain",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "sideEffects": false,
  "exports": {
    "./Campaign": "./Campaign.ts",
    "./Recipient": "./Recipient.ts"
  },
  "scripts": {
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
```
As you can see we have called the new package `@my-app/domain`.

The `exports` block controls which internal files are part of the package API. Anything that is not present here won't wet exported (See [node docs](https://nodejs.org/api/packages.html#package-entry-points)).

And the domain package will get its own TypeScript config:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "outDir": "dist",
    "rootDir": ".",
    "declaration": true
  },
  "exclude": ["node_modules", "dist"]
}
```

If we want to use this package inside our `apps/backend/` we need to import it. So let's add a new line inside the `dependencies`:

```json
{
  "name": "@my-app/backend",
  "version": "0.1.0",
  "private": true,
  "dependencies": {
    "@my-app/domain": "file:../../packages/domain",
    "express": "^4.18.3",
    "drizzle-orm": "^0.44.7",
    "zod": "^3.23.3"
  }
}
```

And with that we can start using the classes under `packages/domain` as we were using them when they belong to the backend.

We just have to turn this:

```ts
import express from "express";

import { Campaign } from "../domain/Campaign";
import { Recipient } from "../domain/Recipient";

import { CampaignRepository } from "../db/repositories/campaign.repository";
import { RecipientRepository } from "../db/repositories/recipient.repository";
```

into this:

```ts
import express from "express";

import { Campaign } from "@my-app/domain/Campaign";
import { Recipient } from "@my-app/domain/Recipient";

import { CampaignRepository } from "../db/repositories/campaign.repository";
import { RecipientRepository } from "../db/repositories/recipient.repository";
```

The database imports still point to `../db` because I have not extracted the database package in this step.

In practice, this import change has to happen everywhere the backend uses domain code. Every file that imports from `../domain/...` now has to import from `@my-app/domain/...`.

That is tedious, but you can probably do it with a simple search and replace.

So, once you have done this for the domain package, the same pattern can be repeated for the database package, environment parsing, logging or whatever else you want to extract and share.

## Managing The Monorepo


Once the repository is a monorepo, there are a few habits that have to change.

The first one is dependency installation.

In a normal app, I run `npm install` in the application folder and get a `node_modules` folder next to that app's `package.json`.

In a workspace, all the dependencies get installed in the root. So even if you install the dependencies in one main `node_modules` folder at the root of the repository.

And that happens even if you make the install from a particular package. If you do something like this:
```bash
cd apps/backend
npm install
```

You will install all the required dependencies of the backend (and its package dependencies like db or domain) inside `/node_modules` not inside `/apps/backend/node_modules`.

So the repository looks like this after install:

```text
manuscritten/
  node_modules/
    @my-app/
      backend -> ../../apps/backend
      domain -> ../../packages/domain
    express/
    zod/
    ...

  apps/
    backend/
      package.json

  packages/
    domain/
      package.json

  package-lock.json
  package.json
```

The second habit is command forwarding.

Once the backend lives in `apps/backend`, it is pretty boring to `cd` into that folder every time you want to run a command inside of ti.

The root `package.json` can forward commands into workspace packages:

```json
{
  "scripts": {
    "dev:backend": "npm run dev -w @my-app/backend",
    "build:backend": "npm run build -w @my-app/backend",
    "start:backend": "npm run start -w @my-app/backend",
    "typecheck:backend": "npm run typecheck -w @my-app/backend",
    "typecheck:domain": "npm run typecheck -w @my-app/domain"
  }
}
```

Now you can run the aprpopriate command the root and npm will take the underlying package.json script and execute it from there.

```bash
npm run dev:backend
```

Of course you can also call the same commands directly from the terminal
```bash
npm run dev -w apps/backend
```

This split is nice because the root becomes a control panel, while each package still owns the details of how it runs.

There is also a useful command for running the same script across all packages:

```json
{
  "scripts": {
    "typecheck": "npm run typecheck --workspaces --if-present"
  }
}
```

The `--workspaces` flag tells npm to run the command in every workspace.

The `--if-present` flag matters because not every package has to implement every script. Maybe `apps/backend` has `build`, `packages/domain` has `typecheck`, and `packages/db` has no tests yet. I do not want the root command to fail just because one package does not need that script.

The same idea is useful in CI.

The install step stays at the root:

```yaml
steps:
  - uses: actions/checkout@v4

  - uses: actions/setup-node@v4
    with:
      node-version: 20
      cache: npm

  - run: npm ci
```

Then you can run checks for the whole monorepo:

```yaml
  - run: npm run typecheck
```

Or target a single package:

```yaml
  - run: npm run typecheck -w @my-app/domain
  - run: npm run build -w @my-app/backend
```

That becomes useful as the repository grows.

## Setting Up The Worker Package


At this point, the repository has the structure we need to create the worker.

The worker is not a shared library, so I do not put it under `packages/`. It is another application runtime, so it goes under `apps/`:

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

The worker package gets its own `apps/worker/package.json`:

```json
{
  "name": "@my-app/worker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@my-app/domain": "file:../../packages/domain",
    "@my-app/db": "file:../../packages/db",
    "tsx": "^4.19.2",
    "typescript": "^5.4.2",
    //... more dependencies
  }
}
```

And its TypeScript config can be as small as this:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

For now, `apps/worker/src/index.ts` does not need to do anything special:

```ts
console.log("Worker started");
```

As you can see, we can run the worker by doing
```bash
npm run dev -w @my-app/worker
```
We can also forward the command from the root `package.json`:

```json
{
  "scripts": {
    "dev:worker": "npm run dev -w @my-app/worker",
  }
}
```

And run it from the root:

```bash
npm run dev:worker
```

That gives us an empty worker process that can already import the same internal packages as the backend. Which was the objective of this article.

The next article is where the worker starts doing real work: connecting it to the queue, registering tasks, and processing validation jobs.

See you there!
