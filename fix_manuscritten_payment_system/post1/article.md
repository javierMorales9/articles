# The Day Concurrency Broke the Billing of My App. And how it can happen to you

About a week before everything broke, we had launched the Manuscritten API.

That API was supposed to remove a very annoying step from our customers’ workflow.

Until then, many customers had to upload CSVs when they wanted to create a batch of handwritten letters. But that approach required manual work and was error prone (which led to us having to routinely jump into calls with customers every time they wanted to make a new campaign. Not recommended).

We wanted to get rid of all the hassle. And we expected that the new API would help us automate much of the process by letting them send the letter info directly from their own applications: CRM workflows, ecommerce automations, internal tools, wherever they already had their data.

The main objective was to make handwritten letters work as any other digital marketing channel: we jump with you in to a call (no way to avoid this, it seems), we help you connect our app to your current workflow, and from that point forward you start sending letters to your clients physical inbox without thinking about it ever again. That was the theory.

And, to be honest, everything seemed to be working as expected. The first integrations we did with a couple of low-volume clients that wanted to connect their CRM were successful.

So we opened it up for everyone else. And most of them didn’t gave a shit.

But there was one that was very thrilled about it. He had mentioned to us on a few occasions that he wanted to run an upselling campaign for some active customers, but in the end, for one reason or another, he never got around to it. And now that, thanks to the API, he didn’t have to export the data and could connect the CRM, he wanted to give it a try.

So we jumped into a call and helped him set up the integration. And tested with a few active users, and their letters were created correctly inside Manuscritten.

So perfect, job done, we said. But then came the big blow. 

Two days after setting up the integration I received a notification in slack saying that the letter creation endpoint was in fire. I went to check the logs and I saw that more than 1.000 letters had been created in the **just one second**. And believe me, for a small startup, that is a couple orders of magnitude greater that what we usually had.

When I checked, it turned out that all of the letters were from the same customer we had set up the integration for two days before. He had made a dump of all its active users to our API all of them at once.

With the spike of adrenaline still going around my body I went to the app to see if the letters were there and, surprisingly, they were. The addresses looked fine, the logs showed that all requests returned a 200 code. There were no obvious errors in the admin panel.

Only one thing was wrong: the credits barely moved. In principle, every letter that we receive got charged immediately. So if a customer has 100$ available in credits their account, and we receive a card that costs 3$, their credit balance should end up being 97$. Simple math.

But that was not what happened with the 1.000 received cards. In that case, it looks like only 20 of them were charged. I could not believe my eyes when I saw it. The customer had roughly 3500$ in credits before the dump. If each letter costed 3$, the final balance should have been 3500 - 3000 = 500$. But instead showed that 3440$ were remaining. We had charged 2940$ less that we should have!

How could that be? Well, it did not take long to realize what had happened: our credits system had a race condition.

And that’s what I want to talk about in this series of articles. In particular:

- the exact mechanism that broke the credits system, and how to recognize designs that are vulnerable to the same bug;
- why these problems are hard to find during normal development, and why unit tests and regular integration tests rarely help;
- how to build load tests that measure the specific accounting invariant you care about;
- and finally, the Postgres strategies we considered to fix it, including the one we chose.

But before getting into the race condition itself, I need to give you a bit of context.

## What Manuscritten Does

Manuscritten sends handwritten letters for companies.

And yes, I mean real letters. Physical letters. Written by hand, although in our case the hand belongs to a robot. They are the kind of thing a company sends when it wants to leave a warmer impression than another email notification or another automated WhatsApp.

In what cases are they useful?

Well, imagine an ecommerce company has just launched a new product and they want to send a handwritten letter to customers who have already bought from them three times, because those customers are good candidates for an upsell.

So, they set up an automation in their CRM like this: *When a customer’s purchase count reaches 3, send that customer’s name and address to the Manuscritten API*.

From the customer’s point of view, this is simple. Their CRM detects a business event and calls our API.

From our point of view, the flow is:

1. Receive the letter request.
2. Create the letter.
3. Calculate the price.
4. Charge the company credits.
5. Mark the letter as pending writing.
6. Later, when there is available writing capacity, send the job to the writing robot.
7. Finally, send the handwritten letter through postal mail.

The simplified flow looks like this:

```mermaid
flowchart LR
  CRM[Customer CRM] --> API[Manuscritten API]
  API --> Charge[Charge the letter]
  Charge --> Queue[Pending writing]
  Queue --> Robot[Writing robot]
  Robot --> Mail[Postal mail]
  Mail --> Recipient[Recipient mailbox]
```

For this article, the interesting part is one box in that diagram: **Charge the letter**.

That is where the race condition lived.

## How Billing Works

The number of letters that can arrive through the API is variable.

One day a customer sends two letters. Another day a customer syncs a historical segment and sends 1,000 in a second.

That variability matters because every physical letter has a real cost: paper, ink, envelope, postage, operations, writing capacity. We need a billing model that is flexible enough for customers and still protects the business when volume spikes.

The model we use is prepaid credits.

A customer buys credits in advance. Then, every time a new letter arrives through the API, we calculate its cost and subtract it from the company’s available credits.

The price of a letter can depend on things like destination country, paper quality, and other production details. But the simplified model is intentionally small:

Each company has a credit balance and each letter has a price. When a letter arrives, we calculate the cost and charge it against the company’s credits.

It can be represented with something like this:

```ts
class Company {
  id: string;
  availableCredits: number;
}

class Letter {
  id: string;
  companyId: string;
  address: string;
  country: string;
  price: number;
}
```

`availableCredits` represents prepaid credits the company can spend.

The main invariant that the billing system has to preserve is that:

```text
finalAvailableCredits = initialAvailableCredits - totalChargedLetterCost
```

If a company starts with 100 credits and we successfully charge letters worth 8 credits, the company must end with 92 credits.

Ok, so why did the endpoint break then?

You’ll understand it when you see the code. The endpoint basically did something like this:

```ts
await db.transaction(async (tx) => {
  const company = await companyRepo.find(tx, campaign.companyId);

  const letter = Letter.new({
    companyId: campaign.companyId,
    recipientName: input.name,
    address: input.address,
    country: input.country,
  });

  const cost = letter.getCreditCost();
  const available = company.getAvailableCredits();

  company.setAvailableCredits(available - cost);
  letter.markAsCharged();

  await letterRepo.saveLetter(tx, letter);
  await companyRepo.saveCompany(tx, company);
});
```

This does a read-modify-write:

1. Read the current value.
2. Compute a new value in application memory.
3. Write the computed value back later.

In SQL terms, the whole transaction has this shape:

```sql
BEGIN;

SELECT available_credits
FROM company
WHERE id = $company_id;

-- The application computes:
-- computed_available_credits = available_credits - letter_price

INSERT INTO letter (
  id,
  company_id,
  recipient_name,
  address,
  country,
  price
) VALUES (
  $letter_id,
  $company_id,
  $recipient_name,
  $address,
  $country,
  $letter_price
);

UPDATE company
SET available_credits = $computed_available_credits
WHERE id = $company_id;

COMMIT;
```

Do you spot where the race condition is here?

## Where The Race Condition Lives

Imagine the company starts with 100 credits.

Two letters arrive at almost the same time:

- John's letter costs 3 credits.
- Tracy's letter costs 5 credits.

The correct final balance is:

```text
100 - 3 - 5 = 92
```

The dangerous detail is that the final `UPDATE` does not say "subtract this letter price from the current balance."

It says "store this balance I computed earlier."

That distinction is the whole bug.

Now imagine the two requests overlap like this:

```text
Initial state:
company.availableCredits = 100

Request A, John's letter:
1. Begins transaction
2. Reads company.availableCredits = 100
3. Letter costs 3
4. Computes new balance = 97

Request B, Tracy's letter:
5. Begins transaction
6. Reads company.availableCredits = 100
7. Letter costs 5
8. Computes new balance = 95

Request A:
9. Saves company.availableCredits = 97
10. Commits

Request B:
11. Saves company.availableCredits = 95
12. Commits

Final state:
company.availableCredits = 95
```

Both letters requests succeeded.

But the company was charged only 5 credits. John’s 3 credits disappeared from the accounting result.

Postgres did not randomly lose credits. It stored the values the application sent. The bug was that both values had been computed from the same stale balance.

I hope you know understand why, when we received the 1.000 letters from our client we only charged 20.

In our case, the company had 3500$, and each card costed 3$. Let’s say how this logic apply when there are more than two concurren requests.

Let’s say that a card creation request takes 400ms to be processed. And that, during the spike, we receive a letter every 20ms in average. Then, between the time we receive the first request (Request 1) until that request finishes (commit), we receive another 20 requests (Requests 1 - Request 20). Well, the problem is that, all of these 20 requests will read the same `availableCredits` from the company, 3500$, so all of them come to the conclusion that the new company balance (new `availableCredits`) should be 3500 - 3 = 3497. **All of them write the same value to db**.

So, we end up charging 3$ when we should have charged 60. **20x** less that we should have.

```text
Initial company credits: 3500$

    Time
  0ms | <--- Request 1 comes (reads company.availalbeCredits = 3500$)
 10ms | 
 20ms | <--- Request 2 comes (reads company.availalbeCredits = 3500$)
 30ms |
 40ms | <--- Request 3 comes (reads company.availalbeCredits = 3500$)
 50ms |
      .
      .
      .
380ms | <--- Request 20 comes (reads company.availalbeCredits = 3500$)
390ms |
400ms | ---> Request 1 finishes (writes company.availableCredits = 3497$)
410ms |
420ms | ---> Request 2 finishes
430ms |
440ms | ---> Request 3 finishes
      .
      .
      .
```

## But There Was A Transaction

This is the natural objection. And it is the one that makes this kind of bug easy to miss during development.

The code used a transaction. The letter and company were saved together. The request did not leave the system half-written.

But that was not the problem.

A transaction can make a set of operations atomic for one request. It does not automatically make a read-modify-write sequence safe when another transaction is reading and writing the same balance at the same time.

In fact, because of MVCC and transaction isolation, this is exactly the kind of thing a database is designed to allow. One transaction does not normally see another transaction’s uncommitted changes. So unless we explicitly tell the database to coordinate access to that company balance, each request can work from its own snapshot and have zero knowledge that another request is touching the same row.

That is how a transaction can still make a correct local decision from stale global state.

## Why This Was Hard To Notice

The worst part of this bug was that the individual records looked fine, their addresses where in place and there were no request failures.

That is why this class of bug is so dangerous. It does not necessarily break the thing you are staring at and normal tests rarely catch them.

A unit test that calls the billing method once will pass.

An integration test that creates one letter through the API will pass.

Even an integration test that creates ten letters sequentially can pass, because each request sees the latest balance before computing the next one.

The bug only appears when multiple successful operations overlap in time and mutate the same accounting state.

And if you don’t check it in advance you are very prone to find the issue in production.

## Ok, so what now then?

Well, if this concurrency bug is hard to reproduce and we didn’t catch it until it was living in production. Jumping directly to find a solution to the issue you’ll agree with me that is not a good idea.

If we want to know if our solutions works as intended, we need a test that reproduces the kind of stress under which this bug appears. Otherwise we cannot know whether a solution really fixed the issue, or whether we simply failed to trigger it that time.

That’s precisely what we are going to see in the next article. Were we will build a test that can simulate concurrent API traffic, reproduce the bug we had seen in production and check if the the accounting stays correct even when the API receives thousands of requests.

See you there!