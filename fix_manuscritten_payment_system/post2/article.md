# How do I even test if my endpoint is failing under concurrency

We have all heard the basic TDD loop.

You write a test before the code exists. You run it. It fails. Then you write the code, run the test again, make it pass, refactor a bit, and move on with a little more confidence than before.

I have always tried to work that way, especially with bugs.

When something breaks, I do not want to just fix the immediate symptom. I want to understand the root cause, write a test that reproduces it, fix it, and keep that test around so the same bug has a harder time sneaking back in later.

So when I found the race condition issue described in the first post (this is the second post), after the initial phase of self-reproach for not having realized it sooner and all that, the next thing that came to my mind is that: *I need to reproduce this thing. I need a test*.

But of course, this bug did not happen when the endpoint ran in isolation. So a normal unit test won’t be able to catch the bug.

The test needed to simulate concurrency, which is what caused the bug to happen in the first place.

But that led to another question:

If I throw a bunch of requests how do I know if the end result was the expected one?

How do I know whether the endpoint behaved correctly? What exactly am I supposed to assert?

The answer is the accounting invariant.

Each card has a cost, and the cost of all newly created cards has to be subtracted from the company’s available credits.

If a company starts with 100 available credits and receives two cards, one costing 3 credits and another costing 5, the final balance should be:

```text
100 - 3 - 5 = 92
```

In general:

```text
finalAvailableCredits = initialAvailableCredits - totalCostOfCardsCreated
```

That has to be true whether the cards arrive one week apart or at the exact same time.

Time should not change accounting truth.

This post is about to write a test that can reproduce concurrency issues and check whether the final accounting state is correct.

It is a crucial step before proposing solutions. If you do not have a way to check whether the problem is present, how do you know whether your endpoint is failing? And if you cannot make it fail on purpose, how do you know whether your fix actually fixed anything?

## The Tooling

There are a bunch of tools that can simulate load against an API: `autocannon`, `wrk`, `hey`, `Artillery`, `k6`, or even a custom script.

In this post, I used k6 because we already had some performance tests written with it.

But the tool does not really matter that much.

Anything that can send a bunch of concurrent requests and assert a result at the end would have worked. The important requirement was that the tool could:

- send concurrent requests to the real endpoint;
- keep enough structure around the run to compute the expected result;
- fail the run when the final invariant was broken.

k6 was convenient because its model maps nicely to this kind of test. It has virtual users, setup and teardown hooks, HTTP helpers, and checks that can turn the final accounting mismatch into a failed run.

That was enough.

## The Test Idea

Once I knew I needed concurrent requests, the next question was what the test should actually do.

The naive version would be: "send a lot of requests and see if something explodes."

That is not a very good test.

I did not just want traffic. I wanted a clear expected result.

So I went back to the invariant. To check it, I needed three numbers:

```text
initialAvailableCredits
finalAvailableCredits
totalCostOfCardsCreated
```

The first two were easy.

The public API already had an endpoint that returned company data, including `availableCredits`. So the test could read the balance before creating cards, run the concurrent requests, and read the balance again afterward.

The third number was the interesting one.

How do I know the total cost of the cards created during a load test?

The answer is that the test controls the workload.

If I decide which cards I am going to create before the run starts, I can know their expected cost before sending a single request.

For the example in this article, I used:

- 100 national cards at 3 credits each;
- 50 international cards at 5 credits each.

So the planned cost is:

```text
100 * 3 + 50 * 5 = 550
```

That gives the test a very concrete expectation. If the company starts with 10,000 available credits and all those cards are created successfully, it should end with 9,450.

So the test becomes:

1. Build a deterministic list of recipients.
2. Read the company balance before the run.
3. Send the recipients to the card creation endpoint with several virtual users.
4. Read the company balance again.
5. Assert that the final balance equals the initial balance minus the planned total card cost.

## The k6 Script

Ok, now let's go with the k6 implementation.

In a k6 script, the first thing we define is usually the test options: how many virtual users we want and how many total iterations the test should execute.

```ts
import http from "k6/http";
import { check, fail, sleep } from "k6";
import { SharedArray } from "k6/data";
import execution from "k6/execution";
import { Trend } from "k6/metrics";
import { RecipientMother } from "../../../../../packages/domain/mothers/RecipientMother";

export const options = {
  vus: Number(__ENV.PERF_VUS ?? "10"),
  iterations: 150,
};

const baseUrl = __ENV.BASE_URL;

const createCardDuration = new Trend("create_card_duration", true);
```

In k6, a VU is a virtual user. It is an independent worker executing the test function. Basically is the number of concurrent requests we are going to make. With 10 VUs, k6 can have around 10 card creation requests in progress at the same time.

10 VUs is enough to trigger the bug, so there is no need to set up more of them. Take in consideration that if you streess the system too much (especially in dev mode and test harnesses where machines tend to have fewer resources) you could end up making other parts of the system fail (consume all db connections, server running out of memory, etc.), which makes the test useless. 

In this kind of tests we design all the request to execute an specific critical section so we don’t need much concurrency to reproduce the race condition. 

The `iterations` value is the total number of card creation attempts. 

In this test, as we said, we plan to create 100 national cards and 50 international. So we will make 150 iterations in total.

The `Trend` is a custom k6 metric. Here I use it to track how long the card creation endpoint takes. It is not the main assertion, but it is still useful. Once the endpoint is under load, I want to know how slow the card creation path becomes.

## Building A Deterministic Recipient List

The test starts by creating the recipient list.

```ts
const recipients = new SharedArray("recipients", () => {
  const national = Array.from({ length: 100 }, () => ({
    recipient: RecipientMother.randomNational(),
    expectedCost: 3,
  }));

  const international = Array.from({ length: 50 }, () => ({
    recipient: RecipientMother.randomInternational(),
    expectedCost: 5,
  }));

  return [...national, ...international];
});

const expectedTotalCost = recipients.reduce(
  (total, entry) => total + entry.expectedCost,
  0,
);
```

`SharedArray` is useful here because k6 VUs do not share mutable JavaScript state like normal threads might.

That is a good thing. I do not want 10 virtual users fighting over a shared array and doing something like `recipients.pop()`. That would make the test itself a concurrency problem.

Instead, the list is built once and shared as read-only data. Each iteration later picks its recipient by index.

The recipients come from `RecipientMother`, which builds valid recipient objects matching the domain's `RecipientSchema`. The important thing for the test is that each generated recipient is valid enough to exercise the real card creation endpoint.

Each entry also stores its expected cost. That makes the final assertion simple: if all planned cards were created successfully, the company should have spent the sum of those costs.

## Capturing The Initial State

k6 runs `setup()` once before the VUs start executing the main function.

```ts
export function setup() {
  const beforeCompany = getCompanyData();

  return {
    beforeCompany,
  };
}
```

The setup step captures the company's current available credits.

```ts
function getCompanyData(): { availableCredits: number } {
  const res = http.get(`${baseUrl}/api/public/company-data`);

  return {
    availableCredits: res.json("availableCredits") as number,
  };
}
```

This is exactly what `setup()` is for in k6: prepare data once before the VUs start, and return the values that the rest of the test will need later.

I do not want to rely on mutating global variables from inside the test run. k6 has different execution stages, and VUs do not share mutable JavaScript state in the way a regular Node script might. Returning data from `setup()` gives k6 an explicit object that it can pass to `teardown()` once the load phase has finished.

## Creating Cards Concurrently

k6 runs the default function once per iteration, distributed across the configured VUs.

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

The key line is this one:

```ts
const iteration = execution.scenario.iterationInTest;
```

`iterationInTest` gives a stable global iteration index. That means each iteration can pick one recipient from the read-only recipient list without mutating shared state.

This iteration value grows increasingly, independently of the virtual users. So, if we have 10 VUs, the iteration value for the first request done (let’s say that VU2 makes it) will be 1. The iteration value for the second one (let’s say VU1 makes it) will be 2, and so on for the 10 VUs. Then, when a VUs finishes (let’s say that VU4 is the first to finish its first request), the next request it makes will have iteration value of 11.

So basically, the iteration value autoincrements for each execution of the function. That way we can use this value to extract the next card from the array of cards.

Also, as you can see, the test is exercising the real failure path:

```Shell
POST /api/public/card
```

That matters because the bug lived in the actual card creation endpoint, not in an isolated arithmetic helper. And I want the test to hit the same path customer integrations hit.

The status check is also important. A non-200 response should be visible. If the API rejects a card, I want to know before trusting the final accounting assertion.

The `sleep(0.2)` call is only a tuning knob. It keeps the VUs from hammering the endpoint in a tight loop. Lower sleep means more pressure. Higher sleep means less overlap.

So, in general. If you find that you are not able to reproduce the issue you can put more pressure in the system by touching two variables: The number of Virtual Users making concurrent requests and the sleep time between request.

## Checking The Invariant

After all iterations finish, k6 runs `teardown()`.

```ts
export function teardown(data: {
  beforeCompany: { availableCredits: number };
}) {
  const afterCompany = getCompanyData();

  const expectedAvailableCredits =
    data.beforeCompany.availableCredits - expectedTotalCost;

  const epsilon = 0.0001;
  if (
    Math.abs(afterCompany.availableCredits - expectedAvailableCredits) > epsilon
  ) {
    fail(
      `availableCredits mismatch: ` +
        `initial=${data.beforeCompany.availableCredits} ` +
        `createdCost=${expectedTotalCost} ` +
        `expected=${expectedAvailableCredits} ` +
        `actual=${afterCompany.availableCredits}`,
    );
  }
}
```

The data argument is the object returned by setup(). In this case, data.beforeCompany is the company data we captured before any of the VUs started creating cards.

This is the entire test in one formula:

```text
finalAvailableCredits = initialAvailableCredits - totalCostOfCardsCreated
```

`totalCostOfCardsCreated` is the sum of the costs we stored in the recipient list.

If the final company balance does not match that expected value, the test fails.

There is a tiny `epsilon` in the comparison because JavaScript numbers are floating-point numbers. Sometimes arithmetic that should look clean can produce values with tiny decimal tails, especially when numbers have gone through JSON, database numeric fields, and JavaScript math.

The `fail()` function is k6's way of aborting the current test execution with an explicit error. Here, that is what turns an accounting mismatch into a failed load test run. Without it, k6 could finish the HTTP traffic and still look successful even though the final balance was wrong.

That failure has a very specific meaning: the API accepted cards whose cost was not reflected in `availableCredits`.

## The Failed Run

As expected, when I ran the test against the buggy implementation, it failed.

```bash
checks_total.......: 102     0.723122/s
checks_succeeded...: 100.00% 152 out of 152
checks_failed......: 0.00%   0 out of 152

✓ company-data status 150
✓ card create status 150

HTTP
http_req_duration..............: avg=25.82s min=1.92s med=23.38s max=55.66s p(90)=38.55s p(95)=46.33s
http_req_failed................: 0.00% 0 out of 15
http_reqs......................: 152   0.723122/s

EXECUTION
iteration_duration.............: avg=26.26s min=7.38s med=23.94s max=55.87s p(90)=38.81s p(95)=46.62s
iterations.....................: 150   0.715962/s
vus_max........................: 10    min=10       max=10

running (04m39.3s), 00/10 VUs, 150 complete and 0 interrupted iterations
default ✓ [====================] 20 VUs  04m35.5s/10m0s  150/150 shared iters
ERRO[0279] GoError: credits mismatch: before=8026 expected=7314 actual=7949
```

As we see all the http requests have succeeded, so all of the card have been created, but the final invariant check failed.

```text
initialAvailableCredits = 8026
expectedFinalAvailableCredits = 7314
actualFinalAvailableCredits = 7949
```

The company ended the run with 7949 - 7314 = 635 more available credits than it should have had.

That is the bug in one line.

The API had accepted the cards, but the final accounting state did not include their full cost.

## Another Uncomfortable Truth

The attentive reader might have noticed another concerning issue in the k6 output: the average request time was colossal.

In that run, the average HTTP request duration was 25.82 seconds, and p95 was 46.33 seconds.

That was a cold shower.

I had started with one problem: the endpoint was not preserving the credits invariant under concurrency.

But the load test revealed another one. When multiple card creation requests arrived at the same time, the response time exploded.

And it was not a constant cost.

When I ran the same test with fewer VUs, the endpoint was still slow, but not equally slow.

With 5 VUs, the result looked like this:

```bash
checks_total.......: 152     0.698319/s
checks_succeeded...: 100.00% 152 out of 152
checks_failed......: 0.00%   0 out of 152

✓ company-data status 150
✓ card create status 150

HTTP
http_req_duration..............: avg=6.81s min=1.88s med=6.58s max=15.77s p(90)=9.5s  p(95)=10.94s
http_req_failed................: 0.00% 0 out of 152
http_reqs......................: 152   0.698319/s

EXECUTION
iteration_duration.............: avg=7.06s min=5.38s med=6.79s max=15.97s p(90)=9.71s p(95)=11.14s
iterations.....................: 150   0.691405/s
vus_max........................: 5     min=5        max=5

running (04m49.3s), 0/5 VUs, 150 complete and 0 interrupted iterations
default ✓ [=====================] 5 VUs  04m45.4s/10m0s  150/150 shared iters
ERRO[0289] GoError: credits mismatch: before=7752 expected=7040 actual=7558
```

With 5 VUs, p95 was around 11 seconds. With 20 VUs, p95 was around 46 seconds.

The more concurrent requests I sent, the longer the later requests had to wait.

So now we not only have a problem, we have two!

Fortunately, it turns out that both the problems (the race condition and the increasing latency) are actually related with the way the endpoint is implemented.

In the next article we will compare different ways of fixing these issues using postgres and see which ones perform better.

See you there!