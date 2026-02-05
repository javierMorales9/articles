Title: 1,000 Letters in a Second, and a Broken Payment System

One of the first “we’re scaling now” problems you meet in a startup isn’t a fancy architecture question. It’s concurrency: race conditions in places you assumed were single-file, and database writes that were “obviously correct” when traffic was low.

This series is about that class of bug: write skews, lost updates, and the unglamorous part of fixing them—lock management in the database. Not “add a mutex and move on”, but choosing what to lock, in what order, how to keep the API responsive under contention, and how to prove the invariant is actually holding.

Here’s how it showed up at Manuscritten (see Manuscritten here: `<MANUSCRITTEN_WEBSITE_URL>`).

After we validated that real handwritten letters could actually work as a marketing channel, people immediately asked for the next thing: “Cool. Now how do I automate it?”

And honestly, that was a fair ask. Nobody wants to upload CSVs forever.

So we built automated campaigns.

In Manuscritten, everything is organized around campaigns: you create a campaign in the app, and a campaign creates cards. A “card” is one recipient, one physical letter, one unit of work that will eventually get printed by robots and sent.

The mental model we offered was simple: connect your campaign to your tools through Zapier, HubSpot, whatever you’re already using, and then let us do the rest.

[Visual: Zapier ↔ Manuscritten campaign connection (Zapier logo + app screenshot)]

From there, the flow feels almost boring:
- Your tools send new recipients into Manuscritten through Zapier.
- Those recipients become cards inside a campaign.
- Once a week (or on whatever cadence makes sense), cards get produced and sent.

From the customer’s point of view, it felt magical: their CRM/workflows turned into real letters without anyone touching a CSV.

Everything was wonderful. Until it failed.

The first time it failed, it wasn’t even a “big enterprise” customer. It was an NGO using the integration to run a campaign.

Their workflow had a twist: they weren’t creating recipients one by one. They were building a buffer over time, and then—when they were ready—sending everything in one shot. About 1,000 recipients hit our API almost at once.

The dashboard said ~1,000 cards were created in a second. Then I checked the balance change and felt that quiet kind of panic: it wasn’t “a bit off”. It was impossible. I went through the usual checklist—request logs, API responses, recent deploys—anything that could explain “1,000 created” but “not fully charged”. Nothing was obviously broken. Which is what made it worse.

I still didn’t know the exact cause, so the next step was to make the problem repeatable. I built a simulation to replicate the incident as closely as possible. It reproduced the mismatch reliably, and narrowed the failure down to what it always looks like in hindsight: a race condition.

In this series, I’ll walk through how that simulation was built, how the failure mode was confirmed, and how the system was fixed without turning the API into a pile of 500s.

Let's start by explaining the workflow and the invariant.

## The workflow + the invariant

At the center of automated campaigns there’s one API endpoint: `POST /api/public/card`.

Integrations call it whenever they want Manuscritten to create a new letter for a recipient. Internally, that single request touches two conceptual models:

- `Card`: one recipient, one physical letter, one unit of work that will eventually be printed and shipped.
- `Company`: the customer account that owns the campaign and has a credit balance.

Here is the mental model (simplified entities, only fields that matter for this story):

```txt
Company                                  Card
--------------------------------------   -----------------------------------
id : uuid                                id : uuid
name : string                            campaignId : uuid
availableCredits : number                name : string
                                         surname : string
                                         address : string
                                         zip : string
                                         city : string
                                         province : string
                                         country : string
                                         price : number
```

Manuscritten charges per card using credits. Each card has a computed `price`, and each company has `availableCredits`.

If you forget everything else, keep this invariant in your head:

- If a company creates **N** cards, and each card costs **P** credits, then the company’s balance must go down by **N × P** credits (or we must explicitly record why it didn’t).

This is why these bugs are so painful: the endpoint is doing two jobs at once.

1) It creates a card (work that will become a real letter).
2) It bills for that card (deducts credits).

If those drift apart, cards get created but credits don’t get deducted. And you get the worst kind of failure: the system “looks fine” (200 OK, rows in the DB), but the business math stops adding up.

Now let’s make this concrete with a scenario you can simulate in your head.

Imagine an ecommerce company that sells face creams called GlowSkin. Their best customers are repeat buyers, so they create an automation:

- When a customer makes their **third purchase**, send them a handwritten thank-you letter to their home.
- In that letter, also try to upsell them into a subscription (“so you never run out”).

Operationally, that means: Shopify/HubSpot detects “third purchase”, Zapier fires, and GlowSkin’s integration calls `POST /api/public/card` to create a card.

Here is what one of those requests looks like when the customer is in Spain:

```txt
Incoming card (example)
  campaignId: 2b3c... (example)
  name: "Alicia"
  surname: "S."
  address: "Calle Mayor 10"
  zip: "28013"
  city: "Madrid"
  province: "Madrid"
  country: "ES"
```

And the company (the face-cream brand) currently has:

```txt
Company (example)
  name: "GlowSkin"
  availableCredits: 100.0
```

This is the card creation flow inside the endpoint, with the same example values plugged in:

```txt
Shopify / HubSpot (3rd purchase) -> Zapier
  |
  |  POST /api/public/card
  |  payload: { name: "Alicia", country: "ES", ... }
  v
Manuscritten API
  |
  |  validate input (campaign exists, address fields present, ...)
  v
Price calculation
  |
  |  country = "ES"  ->  price = 3.5 credits
  v
Charge company
  |
  |  before: availableCredits = 100.0
  |  after:  availableCredits = 96.5
  v
Persist
  |
  |  INSERT card(...)
  |  UPDATE company.available_credits = 96.5
  v
200 OK (card created)
```

And here’s the “shape” of the code path (simplified on purpose):

```ts
const card = validateCard(payload)
const company = extractCompany(card)

const before = company.availableCredits
company.restCredits(card.getPrice())
const after = company.availableCredits

await companyRepo.save(company) // UPDATE company SET available_credits = after ...
await cardRepo.save(card)       // INSERT card (...)
```

Under the hood, the repositories are just doing updates/inserts in Postgres. Conceptually:

```sql
BEGIN;

UPDATE company
SET available_credits = $after
WHERE id = $companyId;

INSERT INTO card (...) VALUES (...);

COMMIT;
```

If the volume is low, this works perfectly fine. But what happens if we receive two of them at the same time?

## Two concurrent cards

Now imagine two customers place their third order close enough that the automations overlap in time (two HTTP requests hit the API “at once”).

Both requests look legitimate and identical from a billing perspective:

- both are charging GlowSkin
- both are creating a Spain letter (3.5 credits in our example)

And because they overlap, they both start by reading the same balance.

```txt
Transaction A (card A)
  -- read (sees 100.0)
  SELECT available_credits FROM company WHERE id = $companyId;
  // available_credits = 100.0

  // in-memory math
  // price = 3.5
  // new = 96.5

  (pauses here before writing)

Transaction B (card B)
  -- read (also sees 100.0)
  SELECT available_credits FROM company WHERE id = $companyId;
  // available_credits = 100.0

  // in-memory math
  // price = 3.5
  // new = 96.5

  -- write
  UPDATE company SET available_credits = 96.5 WHERE id = $companyId;
  COMMIT;

Back to Transaction A
  -- write (overwrites with the same 96.5 computed from stale data)
  UPDATE company SET available_credits = 96.5 WHERE id = $companyId;
  COMMIT;
```

Notice what happened:

- Transaction A did correct math based on its read: 100.0 - 3.5 = 96.5
- Transaction B did correct math based on its read: 100.0 - 3.5 = 96.5

The bug is not “bad math”. The bug is that both reads were true at the time they happened, but they can’t both be used as the basis for a write.

So the final value in the database ends up as `96.5`, when it should have been `93.0` after charging two cards.

That’s the lost update: the second write didn’t apply “another -3.5”, it overwrote the row with the value computed from stale data.

If you prefer the business-language version of the same bug: we created two letters (two cards), but only billed for one.

## What’s next in this series

This introduction was about getting the workflow and the failure mode into your head. The rest of the series is the path from “that seems plausible” to “we can reproduce it, fix it, and prove it stays fixed”.

- **Post 2 — Reproduce the race with k6 tests:** build a load test that creates cards in bursts and makes the accounting bug show up on demand.
- **Post 3 — Choose a Postgres locking strategy:** evaluate a few approaches and pick one that makes the invariant true under concurrency.
- **Post 4 — Implement the fix in the codebase:** turn the strategy into code changes that are boring, readable, and hard to misuse later.
- **Post 5 — Monitor the database to validate behavior:** add visibility so we can see contention, slow transactions, and whether deductions match created cards.
- **Post 6 — Add retry mechanisms for lock acquisition:** handle the real-world case where “correct” also has to mean “doesn’t turn into a pile of failures under load”.
- **Post 7 — Run the tests in CI:** wire the reproduction into CI so this doesn’t become a “we fixed it once” story.
