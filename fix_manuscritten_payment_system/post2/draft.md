# Post 2 Draft

## Title

How I Created a Test to Check if My Endpoint Was Failing Under Concurrency

## Hook / Introduction

- Connect with the previous article:
  - In the last article, we saw a nasty race condition that could leave a company balance in an inconsistent state.
  - The core problem was that the card creation endpoint was not preserving this invariant:

```text
finalAvailableCredits = initialAvailableCredits - totalCostOfCardsCreated
```

- Reintroduce the invariant with a small example:
  - If a company starts with 100 available credits.
  - And we create two cards:
    - one national card costing 3 credits;
    - one international card costing 5 credits.
  - Then the company must end with:

```text
100 - 3 - 5 = 92 available credits
```

- State the important property:
  - This must be true whether both requests arrive at the same time or a week apart.
  - Time and concurrency should not change accounting truth.

- Summarize the bug from Post 1:
  - The endpoint followed a read-modify-write pattern.
  - One request could read the company balance.
  - Another concurrent request could commit a balance change.
  - The first request could then write a value computed from stale state.
  - The final database value would look valid as a number, but it would not represent all the cards that had been created.

- Explain why regular unit tests are not enough:
  - The endpoint behaves correctly when it runs alone.
  - The bug only appears when two or more executions overlap.
  - A unit test that calls the code sequentially will usually miss the problem.

- State the goal of the article:
  - Build a load test that simulates concurrent card creation by sending multiple requests at the same time.
  - Use that test to prove whether the endpoint preserves the accounting invariant under concurrency.

- Explain why this test matters before discussing fixes:
  - The next article will compare possible solutions.
  - Before choosing a fix, we need a test that can reproduce the failure and tell us whether a proposed fix actually works.

## Technology: k6

- Mention that several tools could have worked:
  - k6;
  - autocannon;
  - wrk;
  - hey;
  - Artillery;
  - a custom Node script.

- Explain the practical reason for choosing k6:
  - The project already had some performance-test setup around k6.
  - k6 makes it easy to model virtual users, send concurrent HTTP requests, and perform checks at the end of a run.

- Keep the tool choice non-dogmatic:
  - The important requirement is not k6 itself.
  - The important requirement is a tool that can:
    - send concurrent requests to the real endpoint;
    - preserve enough state to compute the expected result;
    - fail the run when the final invariant is broken.

## Test Idea

- The test will create a known set of cards and then verify that the global accounting invariant still holds.

- The invariant has three pieces:
  - `initialAvailableCredits`;
  - `finalAvailableCredits`;
  - `totalCostOfCardsCreated`.

- Measuring available credits is straightforward:
  - The public API already exposes company data.
  - We can read `availableCredits` before creating the cards.
  - We can read `availableCredits` again after creating the cards.

- The interesting question is how to know the total cost of the cards.

- The answer:
  - Since the test creates the cards, it can know the workload in advance.
  - For the article example:
    - 100 national cards at 3 credits each = 300 credits.
    - 50 international cards at 5 credits each = 250 credits.
    - Total planned cost = 550 credits.

```text
totalCostOfCardsCreated = 300 + 250 = 550
```

- Important nuance:
  - The final assertion should be based on cards the API actually accepted.
  - If a card creation request fails, that card should be visible in the test output, but it should not be counted as spent credits.
  - This is why the script can compare card totals before and after the run instead of trusting only the planned recipient list.

- The test shape:
  - build a deterministic list of recipients;
  - read the company balance before the run;
  - send the recipients to the card creation endpoint with several virtual users;
  - read the resulting company/card summary state;
  - assert that the final available credits equal the initial available credits minus the cost of created cards.

## Implementation

The article should explain the script in small pieces instead of showing one large block.

## k6 Test Snippet For The Article

### 1. Imports And Options

```ts
import http from "k6/http";
import { check, fail, sleep } from "k6";
import { SharedArray } from "k6/data";
import execution from "k6/execution";
import { Trend } from "k6/metrics";
import { faker } from "@faker-js/faker";
import { RecipientMother } from "../../../../../packages/domain/mothers/RecipientMother";

export const options = {
  vus: Number(__ENV.PERF_VUS ?? "10"),
  iterations: 150,
};

const baseUrl = __ENV.BASE_URL;

const createCardDuration = new Trend("create_card_duration", true);
```

- Explain that the test is intentionally scoped to one operation: creating cards for an automatic campaign.
- Explain `vus` as k6 virtual users, and why around 10 is enough to create overlapping requests without turning this into a pure benchmark.
- Explain `iterations: 150` as the total number of card creation attempts: 100 national cards plus 50 international cards.
- Explain that the article snippet omits authentication and campaign wiring so the reader can focus on the concurrency test shape.
- Mention that the real script receives the API key and automatic campaign id from the wrapper/seed script.
- Explain `create_card_duration` as a useful performance metric, but secondary to the accounting invariant.

### 2. Deterministic Recipient List

```ts
const recipients = new SharedArray("recipients", () => {
  faker.seed(Number(__ENV.PERF_SEED ?? "42"));

  const national = Array.from({ length: 100 }, () => {
    const archetype = faker.helpers.weightedArrayElement(
      RecipientMother.getValidArchetypes({ international: false }),
    );

    return {
      recipient: RecipientMother.fromArchetype(archetype).build(),
      expectedCost: 3,
    };
  });

  const international = Array.from({ length: 50 }, () => {
    const archetype = faker.helpers.weightedArrayElement(
      RecipientMother.getValidArchetypes({ international: true }),
    );

    return {
      recipient: RecipientMother.fromArchetype(archetype).build(),
      expectedCost: 5,
    };
  });

  return [...national, ...international];
});
```

- Explain that the test starts with a known card set:
  - 100 national cards at 3 credits each.
  - 50 international cards at 5 credits each.
  - 550 planned credits in total.
- Explain why the list is generated before the load run starts: the expected workload must be deterministic.
- Explain `SharedArray`: k6 can share read-only data efficiently across VUs, but VUs should not mutate shared state.
- Explain that `RecipientMother` creates valid recipients matching the domain `RecipientSchema`.
- Mention that `RecipientMother` uses faker internally, and that seeding faker makes the generated recipients repeatable.
- Mention that the final invariant should be based on cards actually accepted by the API, not blindly on `expectedCost`, because failed requests should not count as created cards.

### 3. Setup: Capture The Initial State

```ts
export function setup() {
  const beforeCompany = getCompanyData();
  const beforeCards = getCardsSummary();

  return {
    beforeCompany,
    beforeCards,
  };
}
```

- Explain that `setup()` runs once before the VUs start creating cards.
- Explain that this captures both sides needed later:
  - initial company credits;
  - the current total charged card cost before this run.
- Mention that this makes the script tolerant of existing data, although the preferred wrapper should create a fresh company.

### 4. Reading Company Credits

```ts
function getCompanyData(): { availableCredits: number } {
  const res = http.get(`${baseUrl}/api/public/company-data`);

  return {
    availableCredits: res.json("availableCredits") as number,
  };
}
```

- Explain that this API call gives the initial and final company balance.
- Explain that `availableCredits` is the balance protected by the invariant.
- Explain that the snippet keeps error handling out of this helper so the article can focus on the accounting idea.
- Mention that the real script should still validate status codes and response shapes.

### 5. Reading The Cost Of Successfully Created Cards

```ts
function getCardsSummary(): { chargedTotal: number } {
  const res = http.get(`${baseUrl}/api/public/cards/summary`);

  return {
    chargedTotal: res.json("chargedTotal") as number,
  };
}
```

- Explain why this helper exists: the test should compute the expected credit change from cards the system actually created.
- Explain that a failed `POST /api/public/card` should be visible, but it should not be counted as spent credits.
- Explain `chargedTotal` as the sum of prices for cards that ended up charged.
- Mention that this keeps the article focused on `availableCredits`; `dueCredits` is intentionally out of scope for this post.

### 6. The Concurrent Card Creation

```ts
export default function () {
  const iteration = execution.scenario.iterationInTest;
  const entry = recipients[iteration];

  if (!entry) {
    fail(`missing recipient for iteration ${iteration}`);
  }

  const { recipient } = entry;

  const res = http.post(
    `${baseUrl}/api/public/card`,
    JSON.stringify({
      name: recipient.name,
      surname: recipient.surname,
      company: recipient.company,
      address: recipient.address,
      zip: recipient.zip,
      city: recipient.city,
      province: recipient.province,
      country: recipient.country,
    }),
    {
      tags: { name: "create_card" },
    },
  );

  createCardDuration.add(res.timings.duration);

  const ok = check(res, {
    "card create status 200": (r) => r.status === 200,
  });

  if (!ok) {
    console.warn("card create failed", {
      status: res.status,
      body: res.body,
    });
  }

  sleep(0.2);
}
```

- Explain that k6 runs the default function once per iteration, distributed across VUs.
- Explain `execution.scenario.iterationInTest` as the stable global index that assigns one recipient to each iteration.
- Explain why this avoids shared mutable state: VUs do not need to pop from a common queue.
- Explain that the endpoint being exercised is the real failure path: `POST /api/public/card`.
- Explain why the status code matters: if the API rejects the card, the test should not treat it as a successful creation.
- Explain `sleep(0.2)` as a throughput-tuning knob, not a correctness mechanism.
- Mention that the custom metric records endpoint latency, which will be useful when comparing fixes later.
- Mention that the article snippet omits the automatic campaign id from the payload for readability; the real endpoint receives it because the card must belong to a campaign.

### 7. Teardown: Check The Invariant

```ts
export function teardown(data: {
  beforeCompany: { availableCredits: number };
  beforeCards: { chargedTotal: number };
}) {
  const afterCompany = getCompanyData();
  const afterCards = getCardsSummary();

  const totalCostOfCardsCreated =
    afterCards.chargedTotal - data.beforeCards.chargedTotal;

  const expectedAvailableCredits =
    data.beforeCompany.availableCredits - totalCostOfCardsCreated;

  const epsilon = 0.0001;
  if (
    Math.abs(afterCompany.availableCredits - expectedAvailableCredits) > epsilon
  ) {
    fail(
      `availableCredits mismatch: ` +
        `initial=${data.beforeCompany.availableCredits} ` +
        `createdCost=${totalCostOfCardsCreated} ` +
        `expected=${expectedAvailableCredits} ` +
        `actual=${afterCompany.availableCredits}`,
    );
  }
}
```

- Explain that `teardown()` runs once after all card creation attempts finish.
- State the invariant explicitly:

```text
finalAvailableCredits = initialAvailableCredits - totalCostOfCardsCreated
```

- Explain that `totalCostOfCardsCreated` comes from the database summary, not from the planned recipient list.
- Explain what a mismatch means: some successful card costs were not reflected in `availableCredits`.
- Explain that this is the key proof of the race condition: the endpoint can return successful responses while the final accounting state is wrong.

## Result

### Failed Run Result

Use either the screenshot or a shortened terminal excerpt. If using text, remove the old floating-point noise from the final line.

```text
checks_total.......: 202     0.723122/s
checks_succeeded...: 100.00% 202 out of 202
checks_failed......: 0.00%   0 out of 202

✓ company-data status 200
✓ card create status 200

HTTP
http_req_duration..............: avg=25.82s min=1.92s med=23.38s max=55.66s p(90)=38.55s p(95)=46.33s
http_req_failed................: 0.00% 0 out of 202
http_reqs......................: 202   0.723122/s

EXECUTION
iteration_duration.............: avg=26.26s min=7.38s med=23.94s max=55.87s p(90)=38.81s p(95)=46.62s
iterations.....................: 200   0.715962/s
vus_max........................: 20    min=20       max=20

running (04m39.3s), 00/20 VUs, 200 complete and 0 interrupted iterations
default ✓ [====================] 20 VUs  04m35.5s/10m0s  200/200 shared iters
ERRO[0279] GoError: credits mismatch: before=8026 expected=7314 actual=7949
```

- Explain that the visible HTTP checks all passed:
  - `company-data status 200`;
  - `card create status 200`;
  - `checks_succeeded` is 100%.
- Explain that k6 completed all 200 iterations with 20 VUs.
- Explain that this is why the failure is interesting: the endpoint did not look broken from the outside.
- Explain the invariant failure:

```text
initialAvailableCredits = 8026
expectedFinalAvailableCredits = 7314
actualFinalAvailableCredits = 7949
```

- Explain the missing charge:

```text
7949 - 7314 = 635
```

- Phrase the result clearly:

```text
The company ended the run with 635 more available credits than it should have had.
```

- Mention that the long request durations are useful performance context but not the core failure.
- Mention that the old trailing decimals were a separate numeric precision/display issue and should not distract from the accounting mismatch.

### k6 Metrics To Comment On

- `checks_succeeded`:
  - Shows whether the HTTP-level checks passed.
  - In the example, all visible checks passed, which makes the accounting failure more interesting.

- `http_req_duration`:
  - Shows request latency.
  - Mention average, median, p90, and p95.
  - The endpoint was slow during the run, but latency is not the main failure in this article.

- `http_req_failed`:
  - Shows HTTP transport/request failures from k6's point of view.
  - In the chosen result, it is `0.00%`.

- `iterations` and `vus_max`:
  - Show that k6 completed all planned iterations with 20 VUs.
  - This confirms that the concurrent workload ran to completion.

- Keep the hierarchy clear:

```text
The performance numbers were useful context. The correctness invariant was the reason the test existed.
```

### Database Blocking Note

- Include this as a short aside after the failed result, not as the main thread.
- Start from the visible symptom in the k6 output:
  - The request times were much too high.
  - In the example run:
    - `http_req_duration avg = 25.82s`;
    - `http_req_duration p95 = 46.33s`;
    - `iteration_duration p95 = 46.62s`.
  - Mention that this is not normal for an endpoint that should mostly create a card and update credits.

- Then explain what we found by inspecting the database during the run:
  - Postgres was showing blocked queries.
  - The blocked query was an `insert into "campaign" ... on conflict do update`.
  - Every request was trying to save the same campaign row.
  - Because of that, Postgres forced the conflicting writes to wait.

- Add the dashboard screenshot here:

```markdown
![Postgres blocked queries during the k6 run](./postgres_blocked_queries.png)
```

- Explain what the screenshot shows:
  - Several queries were waiting.
  - They were waiting on `transactionid`.
  - The lock mode was `ShareLock`.
  - The query text shows `insert into "campaign" ...`, which came from the campaign upsert.

- Make the practical meaning clear:

```text
The requests arrived concurrently, but the campaign writes were effectively being serialized by the database.
```

- Then make the important distinction:
  - The database was serializing the writes.
  - But the server code had already executed concurrently before reaching that write.
  - Each request had already loaded company/campaign state and computed its new credit values.
  - So the requests could still carry stale decisions into the queued database writes.

- Key teaching point:

```text
Waiting in the database is not the same as being concurrency-safe.
```

- Explain why:
  - serialization happened too late;
  - it affected the final conflicting writes;
  - it did not protect the earlier read-modify-write decision.
- Optional Postgres detail:

```text
In Postgres this can show up as sessions waiting on a `transactionid` `ShareLock`, which means one transaction needs another transaction's outcome before it can continue with a conflicting row operation.
```

## Closing Direction

- End by making the test the bridge to the next article:
  - We now have a reproducible failure.
  - The endpoint can accept requests successfully and still produce incorrect accounting.
  - Any proposed fix must make this test pass.
  - The next article will compare ways to make this safe under concurrency.
