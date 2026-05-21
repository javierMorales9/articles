# Why I Think You Should Read This Blog

I think an about page has to answer two concrete questions:

- What is this website about?
- Who are you?

Let's start with the first one.

## Have You Been In This Situation?

You are building a reservation flow for your app or ecommerce.

When a user wants to buy a product, you reserve it first by decreasing the available stock. Of course, in a system like this you have to deal with concurrency: how do you avoid race conditions, double reservations, or inconsistent stock when two users try to reserve the same product at the same time?

Your first solution works, but it serializes too much of the flow. Or it relies on application-level checks that feel too easy to break under load.

So now you are asking yourself questions like:

```text
Should I move the reservation counter to Redis and use INCR or DECRBY?
Can I do it directly in Postgres?
Is there a SQL construct that makes this safe?
What exactly needs to be locked?
What is the simplest thing that will not break when traffic increases?
```

Or maybe you are setting up a Stripe integration.

And while developing it, you find out that there are over 258 event types. They all have different amounts of data. The order you get them is not guaranteed. None of them should be trusted. And it is far too easy to have a payment be failed in Stripe and "subscribed" in your app.

And now you are wondering: how do I keep my database consistent while Stripe, my backend, and the user are all doing things at slightly different times?

Or maybe you already have logs.

You did the responsible thing. You installed a logger. You send logs somewhere. You can search them.

And yet, every time a real issue happens, the experience is still:
- Why did checkout fail for this customer?
- Why did this API call return 500?
- Why did this background job retry forever?
- Why am I grepping like a maniac at 1am?

You know any of these problems are not impossible. Other people have solved it right? 

There must be info about it. So you go do what makes more sense:

You search the internet.

## What You Find

And what you find is usually some combination of:

- introductory tutorials for library X;
- very concrete question in stack overflow that, even though can solve a minor detail, doesn't give you much insight.
- vendor articles that start as education and somehow end exactly where their product begins;
- motivational posts about the importance of soft skills, usually reminding us that communicating decisions is more important than technical quality, while giving very little concrete detail about how that communication actually happened, what decision was being communicated, who disagreed, what evidence changed the conversation, or how the tradeoff was resolved;
- posts about how AI helped someone build an MVP in two weeks, without many details about what the product actually does, which features the MVP includes, how the hard parts were handled, or what happened after the demo started touching reality.

None of this solves your problem.

So you ask the AI.

And the answer is often the perfect average of the previous posts.

A little bit of vendor pitch. A little bit of introductory tutorial. A little bit of "in production, you should consider edge cases". Maybe even a library recommendation that, by total coincidence, connects beautifully with the vendor whose docs it has seen 40,000 times.

To be clear, AI is better than generic SEO content.

It can look at your code and adapt the answer to your case. And it is certainly good to describe how unfamiliar APIs work. At least for a decent first pass when you are stuck.

But I often find it is not the greatest tool for developing the judgment required to know whether what it is telling you is good.

And judgment is the thing I usually need most.

## What I Actually Want

What I really want in those moments is expert advice.

Not necessarily a universal answer. Not a "best practice" carved into stone tablets. Just the kind of advice you would get if you had someone on your team who had spent ten years dealing with that specific topic.

Something like:

```text
Hi, I am John Doe, CTO of a startup I founded five years ago.
We now have 2,000 enterprise customers.
Here is the exact problem we had with database backups.
Here was our volume at the time.
Here were our time and budget constraints.
Here is the solution we chose.
Here is what broke.
Here is what I would do differently.
```

When I was dealing with the three problems I mentioned at the start, reservation concurrency, Stripe integration, and logging, I wanted to find posts like [this one about atomic operations in SQL](https://blog.pjam.me/posts/atomic-operations-in-sql/), [this Stripe recommendations repo](https://github.com/t3dotgg/stripe-recommendations), and [this essay on why logging sucks](https://loggingsucks.com/).

That is the kind of writing I like.

## Wait, Who Are You?

Now, the skeptical reader might be asking:

```text
And let me guess. You are one of those altruistic experts sharing your infinite knowledge with the poor and helpless?

To begin with, who the hell are you?
```

Fair.

I am Javier Morales.

I have been working professionally as a full-stack developer for five years. I wrote my first line of code around twelve years ago. For the last four years I have also been building digital products and startups by myself.

Most of them failed.

My current one is [Manuscritten](https://manuscritten.com/), and this one is going fine.

Am I the best developer in the world?

Certainly not.

Am I even an expert?

Who knows. It depends on who you ask. But probably not either.

So why write these posts?

Because I have a hard time finding people describing how they solved the problems I am facing and I would like to help those people that are currently asking themselves the same questions I was asking myself 6 months ago.

And since the real experts apparently do not want to write, I guess I will have to do it.

## Will These Posts Help Me?

Maybe.

That is the honest answer.

I try to write every post between two apparently opposing forces.

First, I write about things I have actually done:

- features I have implemented;
- technologies I have deployed to production;
- pitfalls I have fallen into;
- bugs I have found;
- decisions I had to make with incomplete information.

I try to be detailed about the difficulty of the problem, the tradeoffs I found, and the specific solution I used: code, database tables, indexes, background jobs, React libraries, load tests, scripts, whatever the story needs.

But at the same time, I try to choose topics that can help other people facing similar problems.

So you will probably not find a post here about a bug that only makes sense inside my exact private misery. For example, a very obscure API integration with a legacy system that had to use a database schema designed for a completely different domain.

That might be a funny therapy session. It is probably not a useful article.

Instead, I want to write about topics many product developers eventually run into.

For example: building a dashboard that shows customers how they are using your API.

That is a common product need. If you build an API and customers depend on it, sooner or later someone will want to build a dashboard for it.

And, once I have a topic general enough that multiple people can relate to, I try to be specific enough to be useful. And tell the real way I solved the issue:

- Here is the dashboard I wanted to create.
- Here is why I needed a separate table to store API usage events.
- Here are the indexes I created to retrieve the data fast.
- Here are the React charting libraries I tested.
- Here is why I chose the one I chose.
- Here is the simulator I built to check whether it worked under the traffic we expected.
- Here is what I would change now.

That is the balance I am aiming for. You'll have to tell me if it works or not.

## Okay, I Read A Few Posts And Found Them Useful

Then you should probably subscribe.

That way Substack sends new articles directly to your inbox when I write them, and you do not have to rely on the algorithmic mood of whatever platform happens to be in charge of attention that week.

[Subscribe](TODO_SUBSTACK_URL)

## By The Way

If you found these articles interesting and think my experience could be useful at your company, I would be happy to talk.

You can find me on [LinkedIn](https://www.linkedin.com/in/javier-morales-de-vera-51a612224/), or email me at [javiermorales9@gmail.com](mailto:javiermorales9@gmail.com).
