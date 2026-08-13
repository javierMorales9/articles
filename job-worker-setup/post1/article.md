# When A Next.js Request Stopped Being Enough

![image](header_image.png)

The most important part of almost every backend is the server in charge of the API.

The server receives requests from the client, runs the domain logic, and calls other services when the feature needs them. In the early days of an application, it is pretty normal to do as much as possible inside that main server and avoid the hassle of setting up and maintaining extra services.

That was our case when we started with Manuscritten. The whole application lived inside Next.js and ran on Vercel.

Since we had just one service to manage, we could ship quickly without thinking much about infrastructure.

This approach works greate when the operations you deal with are short-lived enough to fit inside a normal HTTP request.

For example, imagine an endpoint that receives a recipient address and adds it to a marketing campaign (this addresses will then be used to send them letters):

```ts
router.post("/recipients", async (req, res) => {
  const campaign = await findCampaign(req.ctx.db, req.query.campaignId);

  if (!campaign) {
    return res.status(404).json({ error: "Campaign not found" });
  }

  const recipient = new Recipient({
    address: req.body.address,
    zip: req.body.zip,
    city: req.body.city,
    country: req.body.country,
  });

  campaign.newRecipientReceived();
  try {
    validateRecipientWitGoogle(recipient);
    campaign.recipientValidated();
  } catch(e) {
    campaign.recipientValidationFailed();
    // Log the failure or something
  }

  await saveRecipient(req.ctx.db, recipient);
  await saveCampaign(req.ctx.db, campaign);

  return res.json({ ok: true });
});
```

This endpoint does a bunch of things. First it extracts the campaign we are going to create a new recipient for and make sure it exists.

Then we create the new recipient using the address passed in the body and validate it using the google maps API ([this one](https://developers.google.com/maps/documentation/address-validation/reference/rest?hl=es-419) if you are interested).

If the validation is successfull then we increase an internal counter for the number of validated recipients, and the same thing if the validation fails.

```ts
class Campaign {
  constructor(
    public id: string,
    public total: number,
    public validated: number,
    public error: number,
    //...other fields
  ) {}

  newRecipientReceived() {
    this.total += 1;
  }

  recipientValidated() {
    this.validated += 1;
  }

  recipientValidationFailed() {
    this.error += 1;
  }
}
```

*Note: This way of increasing the Campaign counters is not concurrently safe so avoid it if the endpoint can receive concurrent requests for the same campaign (an API for example). It is used for illustration here*

This, you could say, is the typical endpoint one would expect to find in a backend server. Receives some data, make some db calls and external calls, do some kind of computation and save the result in the db again.

In general, this kind of work is meant to run in a short amount of time. Ideally, something around 200ms-300ms, and usually under 1 second, to guarantee a fast experience for the user. No one wants to wait 5 seconds for some data to load right?

The problem is that the concrete time is not fixed. It will depend, among other things, on the number of external services involved, the complexity of the database queries, the number of records involved, and the load of the database and the server at the moment the request arrives.

The main contributor for a bad latency is the number of records involved.

And let me explain what I mean. In our example, the request deals with 2 records, and only 2 records: the campaign and the new recipient.

A more complex endpoint could deal with 7 or 8 records instead of 2. And that request would be more complex (and probably slower) than the previous one, but it would still deal with a fixed number of records.

The good thing about dealing with a fixed number of records is that the request is predictable.

In the end, if you know the number of records you are going to deal with, whether it is 1 or 10, you can make all kinds of optimizations to keep the latency of the request within the range you want. And because the number of records is fixed, while the server and the database have a standard load level, that latency will not vary too much from what you expect.

Personally, I consider this a key characteristic every backend endpoint should have. It is a key requesite (necessary but not sufficient) for fixing great tail latency on your requests.

Unfortunately, sooner or later, most applications meet a task that has to deal with a variable number of records. What do we do in that case?

## The CSV Feature That Changed The Shape Of The Problem

In Manuscritten, we hit that point when we started working with CSV uploads.

When a user wanted to create a marketing campaign for a bunch of potential customers at once they, of course, could not upload recipients one by one.

So we developed a batch upload system that was based on CSVs. The customers would create the CSV with the addresses and upload it to our app

```csv
name,address,zip,city,country
Carla,Calle Mayor 10,28013,Madrid,ES
Bruno,Via Roma 42,00100,Rome,IT
Ann,221B Baker Street,NW1 6XE,London,GB
...
```

Of course, we also wanted to validate all of this addresses, so the endpoint ended up looking something like this:

```ts
router.post("/campaign", async (req, res) => {
  //Convert the incoming csv in the body to an array of rows.
  const rows = await parseCsv(req);
  //Create empty campaign
  const campaign = new Campaign(...);
  const recipients: Recipient[] = [];

  for (const row of rows) {
    //Create the recipient from the address present in the csv row.
    const recipient = Recipient.fromCsvRow(row, campaign.id);
    campaign.newRecipientReceived();

    try {
      validateRecipientWitGoogle(recipient);
      campaign.recipientValidated();
    } catch(e) {
      campaign.recipientValidationFailed();
      // Log the failure or something
    }

    recipients.push(recipient);
  }

  await req.ctx.db.transaction(async (tx) => {
    await saveCampaign(tx, campaign);
    await saveRecipients(tx, recipients);
  });

  return res.json({
    created: recipients.length,
  });
});
```
As you can see, this endpoint is dealing with a variable number of records: as many as rows in the csv.

At first, when we were starting out and just dealt with a few addresses, 50-100, the endpoint worked fine. The latency was under control.

The problem came when the numbers grew to 500, 1000, 2000 addresses or more.

At that size, validation ended up taking minutes. Which is way over the typical API endpoint latency.

And not only that. At that time we were using Vercel for hosting our server. At that time, Vercel Functions had a maximum duration of 12s, and Vercel terminated a function that was longer than this. So there were validations that just couldn't finish.

And besides that, even if we could increase the limits to handle the CSV inside the Vercel request, the user experience was very bad.

The client connection stayed open during the whole validation process so the browser keept waiting without showing any kind of validation while the request was being processed. There was also no way to inform the user how the process was going (the typical "243 of 1000 addresses have been validated").

It was clear that the validation work was very poorly design and not suited for this case.

## What can be done instead?

Simply explained: introduce an external worker, a long-running service whose main job is to process address validations in the background.

And instead of doing the long-running task inside the API endpoint, just send a *job* telling the worker what it has to do.

Let's see how this setup would work with our example.

The endpoint is still the one receiving the addresses of the campaign. But now, it just stores them without validating them. And in the same transaction in which it saves those unvalidated addresses, it will issue an event to some kind of queue notifying the worker that it needs to do the validation.

```ts
router.post("/campaign", async (req, res) => {
  const rows = await parseCsv(req);
  const campaign = new Campaign(...);
  const recipients: Recipient[] = [];

  for (const row of rows) {
    const recipient = Recipient.fromCsvRow(row, campaign.id);
    recipients.push(recipient);
  }

  await req.ctx.db.transaction(async (tx) => {
    await saveCampaign(tx, campaign);
    await saveRecipients(tx, recipients);

    await queue.enqueue("validate_addresses", {
      campaignId: campaign.id,
    });
  });

  return res.json({
    created: recipients.length,
  });
});
```
We can keep the total, validated and error fields inside the campaign to track the progress of the validation in the worker.

When endpoint finishes the Campaign will be empty. And from that moment on, the worker can update the campaign after every address validation.

The worker's job will just be to pick the validation job, validate each address sequentially, and update the campaign state after each validation. Something like this:

```text
worker
  -> pick validation job

  -> pick recipient 1
  -> validate recipient address 1
  -> update recipient 1
  -> update campaign progress: validated += 1

  -> pick recipient 2
  -> validate recipient address 2
  -> update recipient 2
  -> update campaign progress: validated += 1

  ... When all addresses have finished
  -> mark batch as ready
```

This gives the user a better contract too. Now the endpoint can return pretty quickly. The response can say: "We accepted your upload. Validation is running."

To show progress in the UI, we can make the client poll another endpoint like this one:

```ts
router.get("/campaign/:id/progress", async (req, res) => {
  const campaign = await findCampaign(req.ctx.db, req.params.id);
  
  const { total, validated, error } = campaign;
  return res.json({
    total,
    validated,
    pending: total - (validated + error),
    percent: total === 0 ? 100 : Math.floor(((validated + error) / total) * 100),
  });
});
```

And with that the UI can show something concrete:

```text
243 of 1000 addresses validated
```

## Ok, so how do I set up the worker?

So, I hope it is clear that this way of working is much better suited for the API server than the previous one. Now the upload request behaves like any other request, and the hard work is pushed to the worker.

The problem is that now we have to setup the worker and, although the theory is clear, there are probably a lot of practical questions that you are wondering about:

1. How do we communicate the server and the worker? You said we had to use some kind of queue, but how can we implement one? Do we need an additional service just for the queue?
2. How can we manage failed jobs?
3. And retries?
4. Will my worker be able to manage multiple concurrent jobs?
5. Should I create a different worker for each long-running task or can I share it?
6. Can I reuse the current classes and DB connection that we already have in the server in the worker?

In the next two articles I'll share how we have dealt with all these topics while developing a worker for our app.

In particular, I will start by focusing on the last of these questions and discuss how I turned my repo into a monorepo to include a worker.

See you there!
