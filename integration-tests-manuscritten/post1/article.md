# When Unit tests are not enough

One of the first things you encounter when learning about testing is the testing pyramid.

You have probably seen it before. If you do not remember it, the testing pyramid divides tests into three types.

Unit tests are the base of the pyramid. They are the fastest and cheapest to write. The main idea is that you test an individual unit. This, of course, is totally ambiguous, and everyone has their own opinion about what a unit is: a method of a class, a service, a controller, etc.

But they all have in common the idea that there should be no IO present. Mainly no external network calls, file system reads, interprocess communication, etc.

For example, a test that touches a database will probably have to make a network call to access it because typical databases (MySQL, PostgreSQL, Oracle, MongoDB, Redis, etc.) tend to live in their own process, and possibly on another machine. So these kinds of tests cannot be unit tests.

The main advantage of avoiding external systems is that you do not have to wait for them, so unit tests tend to be much faster. They are also simpler because you do not have to spawn the external service during the test. The drawback is, of course, that they cover less surface: the work that happens in the external services does not get tested.

Integration tests, in turn, are tests that do integrate with external services. So these kinds of tests would spawn a database and send real queries to it, for example.

And end-to-end tests do too. The main difference between integration tests and end-to-end tests is that end-to-end tests test it all, while integration tests are limited to one particular integration. So an end-to-end test will test the frontend, API gateway, backend, database, and queue at the same time. An integration test will test just one of these connections, the backend and the database, for example.

According to the test pyramid theory, you should try to achieve a 70/20/10 distribution. So 70% unit tests, 20% integration tests, and 10% end-to-end tests.

The testing pyramid is widely extended and treated almost like a mantra in today's software. And even though the intuition is right, and well-covered software often ends up following this distribution, I feel it introduced, at least for me, a bad way of thinking about what tests to write.

The bad idea is that integration tests are just an improved version of unit tests, and that fulfilling the testing pyramid consists of doing something like this:

1. First, write unit tests for whatever you consider units. Let us say, for the sake of the example, public methods of your classes.
2. Then take 30% of these unit tests, the ones belonging to the most important parts of your app, and convert them to integration tests.
3. And take half of those and convert them to end-to-end tests.

And so the natural conclusion one gets is that integration tests come after unit tests because, according to this interpretation of the testing pyramid, they are just an improvement of those. So instead of writing them from the beginning, you end up saying things like: *for the moment, let us just work on unit tests and we will gradually introduce integration tests over time*.

But that time typically never comes.

For years I thought about integration tests as just an improvement of unit tests, and therefore secondary and less important. And for years I comforted myself thinking that *since the important parts of the app are already covered with unit tests I guess we are kind of safe, right?*

But with time I have come to the conclusion that this idea is fundamentally wrong. Integration tests are not second order with regard to unit tests. Unit tests and integration tests are, essentially, different. It is just not an apples-to-apples comparison.

In fact, integration tests should be used to test things that are **directly impossible** for unit tests to cover.

Simply put: if your integration test is testing something your unit tests already cover, then that integration test is useless. And inversely, if the hard part in your code is happening outside your server process, or in the interconnection with other services, then you should probably head directly to writing integration tests. Regardless of the percentages in the pyramid. Even if you end up with 70% integration tests.

Of course, that will not be the case most of the time. Most of the time unit tests are able to cover much of your code, and integration tests will be less necessary. So you will end up fulfilling the test pyramid and writing 80% unit tests.

But there will also be regions of your code where not much is happening inside your server. Where your code is just a wrapper around an external service or database. And in those cases, writing 80% unit tests asserting that your mock returns the value you set it up to return is kind of useless. You will get a much better return on investment if you just spawn the external service and write integration tests for it.

In this article I will try to unpack the typical cases where I find writing integration tests makes more sense. And in the next article I will share the simplest way I have found to create this kind of test in a Node.js app using testcontainers.

But first, to have something to compare to, let us see the kind of situation where unit tests shine.

## Where Unit Tests Shine

Inside backend applications there tend to be different kinds of code, and some of them are more important than others.

The most important kind is what we usually call domain logic or business logic.

This is the code in charge of mapping the real world that you want to represent, automate, or control.

So, in an ecommerce app, domain logic decides whether a product can be added to a cart, how discounts combine, when an order can be cancelled, or how much stock remains after a purchase.

In accounting software, domain logic decides how an invoice affects a balance, when a payment compensates a debt, or which entries need to be created in the ledger.

In a banking app, domain logic decides whether a transfer is allowed, how much money is available after pending operations, or what happens when two movements hit the same account at the same time.

In essence, domain logic is the code they pay you to write.

No one really cares about the framework or the database that you use. Those decisions matter to us as developers, of course.

But the user will judge the software by whether the business behavior works. What matters to them is whether the cart reserves the product correctly, the accounting system calculates the balance correctly, and the banking app prevents an invalid transfer.

That is why the main architectural methodologies around backend applications, like hexagonal architecture, onion architecture, and the general philosophy behind Domain-Driven Design, put domain code at the center.

The idea is to isolate that domain code from infrastructure concerns: database access, HTTP frameworks, queues, external APIs, file systems, etc. That way, if we want to change some of it later, for example changing from one framework to another, the domain logic does not have to be touched.

And then they move the rest of the code to outer layers that work around the domain one.

To make this concrete, imagine we have a `User` class that represents a user in our app. To keep the example small, suppose a user only has an `id` and a `name`.

```ts
class User {
  constructor(
    public readonly id: string,
    private name: string,
  ) {}

  // getters, setters and rest of methods.
}
```

Of course it will have its corresponding table in the database:

```sql
create table users (
  id uuid primary key,
  name text not null
);
```

The domain classes will get used inside application services that coordinate the domain classes and the infrastructure calls to implement features.

For example, let us suppose that one of the features we want to implement is changing a user's name. For that we could create an application service that does something like this:

```ts
async function changeUserNameService(
  id: string,
  newName: string,
  userRepo: UserRepository,
) {
  const user = await userRepo.get(id);

  if (!user) {
    throw new Error("User not found");
  }

  const previousName = user.updateName(newName);

  await userRepo.save(user);

  return previousName;
}
```

As you can see, it receives an id, a new name, and a `UserRepository`.

The repository is a class in charge of extracting and saving users from wherever they are stored. Typically that means a database, but the application service and the domain layer do not care. More on this in a second.

The service asks the repository for the user, calls `User.updateName` on the user it just extracted, and saves it back through the repository.

A real controller would sit one layer outside this service. It would receive the HTTP request, extract the parameters, and call the application service.

For example:

```ts
import db from "...";

async function changeUserNameController(req: Request, res: Response) {
  const userRepository = new PostgresUserRepository(db);

  const previousName = await changeUserNameService(
    req.params.userId,
    req.body.name,
    userRepository,
  );

  res.json({ previousName });
}
```

It is important that the update itself happens inside `User.updateName`. That way, we make sure that the business rules will be followed by all the users in our app.

For example, if we set up a rule where the user's name must have more than 5 characters, we can enforce it inside the `updateName` method. And now, every time we try to update the name, even if another controller or service tries to do it, the rule will be enforced because it lives inside the `User` class directly.

```ts
class User {
  constructor(
    public readonly id: string,
    private name: string,
  ) {}

  getName() {
    return this.name;
  }

  updateName(newName: string) {
    if (newName.trim().length < 5) {
      throw new Error("User name must have at least 5 characters");
    }

    const previousName = this.name;
    this.name = newName;
    return previousName;
  }
}
```

As we said, the repository is the part of the architecture in charge of extracting and saving domain objects from wherever they are persisted, typically the database.

It usually gets implemented as an interface:

```ts
interface UserRepository {
  get(id: string): Promise<User | null>;
  save(user: User): Promise<void>;
}
```

There are two reasons why this makes sense.

First, the application code does not care whether the user is stored in PostgreSQL, MongoDB, a JSON file, or some ORM-specific abstraction. The application service only cares that there is a thing capable of returning a `User` and saving a `User`.

Second, and more important for this article, tests can provide a fake implementation of the repository without touching the real database.

Of course we will also have multiple implementations of the repository. For example, here we have a PostgreSQL implementation using Drizzle:

```ts
class PostgresUserRepository implements UserRepository {
  constructor(private readonly db: Db) {}

  async get(id: string): Promise<User | null> {
    const row = await this.db.query.users.findFirst({
      where: { id },
    });

    if (!row) return null;

    return new User(row.id, row.name);
  }

  async save(user: User): Promise<void> {
    await this.db
      .update(users)
      .set({ name: user.getName() })
      .where(eq(users.id, user.id));
  }
}
```

One important point about this repository implementation is that it works with domain classes directly. It returns a `User` object and receives a `User` object as a parameter.

The implementation just extracts the data and constructs the object when reading, and gets the data from the object and performs the update when saving. In principle, these repositories should not contain any domain logic. They should just work as wrappers around the database, as our example suggests. Later on, we will see that this condition is not always met, and there are instances where domain logic ends up finding its way into the repository.

## Why This Is Great For Unit Tests

A very common way of writing unit tests is to do it at the application level.

That way, instead of testing public methods or other more granular details, we test complete features of our app. The structure that we have described is very suitable for this kind of test.

If you remember, application services received a `UserRepository` instance. In our example, the controller initialized `PostgresUserRepository` and passed it to the application service so that production code could access the database.

But since `UserRepository` is an interface, in our tests we can create a different mock implementation.

Something like this:

```ts
class TestUserRepository implements UserRepository {
  private users = new Map<string, User>();
  public savedUsers: User[] = [];

  add(user: User) {
    this.users.set(user.id, user);
  }

  async get(id: string) {
    return this.users.get(id) ?? null;
  }

  async save(user: User) {
    this.savedUsers.push(user);
    this.users.set(user.id, user);
  }
}
```

That way we can execute the application service and check if it works **without going to the database**.

For example, we can test the happy path:

```ts
it("updates the user name", async () => {
  const repo = new TestUserRepository();
  const user = new User("user-1", "Initial name");
  repo.add(user);

  const previousName = await changeUserNameService(
    "user-1",
    "New user name",
    repo,
  );

  expect(previousName).toBe("Initial name");
  expect(repo.savedUsers).toHaveLength(1);
  expect(repo.savedUsers[0]?.getName()).toBe("New user name");
});
```

And we can test the business rule:

```ts
it("rejects names that are too short", async () => {
  const repo = new TestUserRepository();
  const user = new User("user-1", "Initial name");
  repo.add(user);

  await expect(
    changeUserNameService("user-1", "abc", repo),
  ).rejects.toThrow("at least 5 characters");

  expect(repo.savedUsers).toHaveLength(0);
});
```

For this particular feature, all the domain logic was inside the `updateName` method in the `User` class, and the PostgreSQL repository was just a wrapper around the database. So these unit tests are enough to cover **all** the domain logic.

Of course, you could also add a couple of integration tests to ensure that the wiring is still correct. But those integration tests will not give you any more certainty around the domain logic.

It is this kind of situation where unit tests completely shine: when all the domain logic lives inside your domain classes.

In a general case, you should try to apply this way of working, and encapsulate all the domain logic inside your domain classes.

But unfortunately...

## Sometimes, The Domain Logic Lives Outside Your Classes

But unfortunately, the world is not always that simple.

There are times when, despite one's best intentions, it makes sense, or you are forced, to delegate part of the business behavior to an external service outside your process.

That external service might be another service inside your own system. For example, maybe pricing lives in a dedicated pricing service because several applications need to share the same discount rules. Your backend sends the cart contents to that service, gets back the final price, and then decides whether to create the order.

It might be an external API. For example, you send an address to a shipping provider, and depending on the response you decide whether the order can be shipped, which carrier options are available, or whether the user needs to correct the address before paying.

It might be a fraud detection service. You pass it the payment attempt, it returns a risk score, and your app decides whether to accept the payment, ask for extra verification, or block the operation.

And, of course, it might be the database.

To avoid extending this article too much, I am going to focus on cases where the domain logic ends up living in database queries, and by extension, in the repository.

When dealing with databases, the main reason why this situation happens is because some problems are naturally set-based, transactional, or concurrency-sensitive. If we forced all the logic to live in the domain layer, we would end up doing something much worse: loading a ridiculous amount of data into memory, reimplementing database behavior in application code, or making a concurrent operation unsafe just so the repository can remain "pure."

Sometimes moving logic into SQL gives us the simpler and faster design, and much better performance. It makes sense to make that tradeoff.

To illustrate the point, let us now see two real-world examples I have found where the logic ended up living inside database queries:

1. A query that calculates active users for a dashboard.
2. A mutation that reserves ecommerce stock atomically.

## Query Example: Active Users Dashboard

Imagine a normal analytics dashboard where we want to show the evolution of active users over a date range:

```text
Day 1: 12 active users
Day 2: 20 active users
Day 3: 8 active users
```

Now imagine that, in our app, an active user is not simply a user who logged in once. A user is active on a given day if both of these things are true:

- they opened the app more than twice that day;
- they made more than three modifications to tasks that same day.

For the example, suppose we have two tables to track this data:

```sql
create table app_sessions (
  id uuid primary key,
  user_id uuid not null,
  created_at timestamptz not null
);

create table task_updates (
  id uuid primary key,
  user_id uuid not null,
  task_id uuid not null,
  created_at timestamptz not null
);
```

If we wanted to keep this logic entirely in the domain layer, we would need to pull all the relevant users, sessions, and task updates into the application and then filter them in memory.

Something like this:

```ts
async function activeUsersByDay(
  start: Date,
  end: Date,
  userRepo: UserRepository,
  sessionRepo: SessionRepository,
  taskUpdateRepo: TaskUpdateRepository,
) {
  const users = await userRepo.getAll();
  const sessions = await sessionRepo.getBetween(start, end);
  const taskUpdates = await taskUpdateRepo.getBetween(start, end);

  return calculateActiveUsersByDay(users, sessions, taskUpdates);
}
```

And then the domain function could do the filtering in memory:

```ts
function calculateActiveUsersByDay(
  users: User[],
  sessions: AppSession[],
  taskUpdates: TaskUpdate[],
) {
  const days = uniqueDays(sessions, taskUpdates);

  return days.map((day) => {
    const activeUsers = users.filter((user) => {
      const sessionCount = sessions.filter((session) =>
        session.userId === user.id && sameDay(session.createdAt, day)
      ).length;

      const taskUpdateCount = taskUpdates.filter((update) =>
        update.userId === user.id && sameDay(update.createdAt, day)
      ).length;

      return sessionCount > 2 && taskUpdateCount > 3;
    }).length;

    return {
      day,
      activeUsers,
    };
  });
}
```

But imagine we are calculating this for one day and our app has 10,000 users, 40,000 app sessions per day, and 80,000 task updates per day.

The endpoint would need to ask the database for roughly 130,000 rows just to answer a question that returns one number for that day. Even with fairly small rows, that can easily mean touching more than 1,000 database pages and moving tens of megabytes once the rows are serialized into JavaScript objects.

Then our backend still has to iterate over all of that data. In the naive version above, it gets even worse because each user filters the sessions and task updates again.

As you can imagine, the performance for this would be horrendous. Seconds at least, and tens of seconds if we increase the load.

Of course, doing it this way makes no sense given the fact that the database already knows how to group, count, join, and filter large sets of rows. Pulling all of that into the server just so we can preserve the logic in the domain layer makes no actual sense.

In this case, I would put the filtering directly in the query:

```sql
with daily_sessions as (
  select
    user_id,
    date_trunc('day', created_at) as day,
    count(*) as session_count
  from app_sessions
  where created_at >= $1 and created_at < $2
  group by user_id, day
),
daily_task_updates as (
  select
    user_id,
    date_trunc('day', created_at) as day,
    count(*) as task_update_count
  from task_updates
  where created_at >= $1 and created_at < $2
  group by user_id, day
)
select
  s.day,
  count(*) as active_users
from daily_sessions s
join daily_task_updates t
  on t.user_id = s.user_id
 and t.day = s.day
where s.session_count > 2
  and t.task_update_count > 3
group by s.day
order by s.day;
```

Now the repository might expose a method like this:

```ts
interface AnalyticsRepository {
  activeUsersByDay(start: Date, end: Date): Promise<Array<{
    day: Date;
    activeUsers: number;
  }>>;
}
```

And the application service becomes almost a wrapper:

```ts
async function activeUsersByDay(
  start: Date,
  end: Date,
  analyticsRepo: AnalyticsRepository,
) {
  return analyticsRepo.activeUsersByDay(start, end);
}
```

This creates an obvious testing problem.

If we write a unit test for this application service by mocking `AnalyticsRepository`, the test looks like this:

```ts
it("returns active users by day", async () => {
  const analyticsRepo = {
    activeUsersByDay: jest.fn().mockResolvedValue([
      { day: new Date("2026-01-01"), activeUsers: 12 },
      { day: new Date("2026-01-02"), activeUsers: 20 },
    ]),
  };

  const result = await activeUsersByDay(
    new Date("2026-01-01"),
    new Date("2026-01-03"),
    analyticsRepo,
  );

  expect(result).toEqual([
    { day: new Date("2026-01-01"), activeUsers: 12 },
    { day: new Date("2026-01-02"), activeUsers: 20 },
  ]);
});
```

But this test is useless. We are just checking that the application service returns the data we told the mock to return.

The query could count sessions wrong, group task updates by the wrong day, or join both tables incorrectly, and this test would still pass.

Unit tests cannot help us with this kind of situation. The only way to test it would be to spawn a database, fill it with test data, and check that it returns what we expect for the input data. So, basically, an integration test.

## Mutation Example: Reserving Ecommerce Stock

Mutations can push us in the same direction, especially when two requests can modify the same row at the same time.

Imagine an ecommerce cart. When a customer adds a product to the cart, the system reserves one unit of stock.

The rule is:

- If stock is available, decrement stock by 1 and report success.
- If stock is 0, do not decrement and report failure.
- Under concurrent requests, never allow stock to go negative.

A first version could load the product, check the stock, decrement it, and save it again:

```ts
async function addProductToCart(
  cartId: string,
  productId: string,
  cartRepo: CartRepository,
  productRepo: ProductRepository,
) {
  const cart = await cartRepo.get(cartId);
  const product = await productRepo.get(productId);

  if (!cart || !product) {
    throw new Error("Cart or product not found");
  }

  if (product.stock <= 0) {
    return { added: false, reason: "out-of-stock" };
  }

  product.stock -= 1;
  cart.addItem(product.id);

  await productRepo.save(product);
  await cartRepo.save(cart);

  return { added: true };
}
```

This version splits the check and the update into two separate steps, what is known as a read-modify-write cycle. With one request, this code works perfectly fine. But it breaks under concurrency. With two concurrent requests, it can reserve more stock than exists.

Suppose the initial state is:

```text
product.stock = 1
```

The interleaving can look like this:

```text
Request A reads stock = 1
Request B reads stock = 1
Request A decrements and saves stock = 0
Request B decrements and saves stock = 0
```

Both requests think they reserved the product, but there was only one unit available.

The `if (product.stock <= 0)` check is not the issue. The issue is that the check and the update are not one atomic operation.

PostgreSQL can help you solve this by expressing the whole reservation as one update:

```sql
update products
set stock = stock - 1
where id = $1
  and stock > 0
returning id, stock;
```

This query decrements the stock only if the current stock is still greater than zero. If another request already took the last unit, the update returns no rows and that way we know the reservation did not happen.

The repository can expose that operation directly:

```ts
interface ProductRepository {
  reserveOne(productId: string): Promise<"reserved" | "out-of-stock">;
}
```

And the PostgreSQL implementation can keep the atomic operation in the query:

```ts
class PostgresProductRepository implements ProductRepository {
  constructor(private readonly db: Db) {}

  async reserveOne(productId: string) {
    const rows = await this.db.execute(sql`
      update products
      set stock = stock - 1
      where id = ${productId}
        and stock > 0
      returning id
    `);

    return rows.length === 1 ? "reserved" : "out-of-stock";
  }
}
```

Then the application service coordinates the cart update:

```ts
async function addProductToCart(
  cartId: string,
  productId: string,
  cartRepo: CartRepository,
  productRepo: ProductRepository,
) {
  const reservation = await productRepo.reserveOne(productId);

  if (reservation === "out-of-stock") {
    return { added: false, reason: "out-of-stock" };
  }

  const cart = await cartRepo.get(cartId);
  if (!cart) {
    throw new Error("Cart not found");
  }

  cart.addItem(productId);
  await cartRepo.save(cart);

  return { added: true };
}
```

So the behavior we care about is not just "return out-of-stock when stock is zero." The hard part is preserving that rule while concurrent requests are trying to reserve the same product. That guarantee lives in the database update.

If we test this application service with mocked repositories, we get the same kind of weak test as before:

```ts
it("adds a product to the cart when stock is available", async () => {
  const cart = {
    addItem: jest.fn(),
  };
  const cartRepo = {
    get: jest.fn().mockResolvedValue(cart),
    save: jest.fn(),
  };
  const productRepo = {
    reserveOne: jest.fn().mockResolvedValue("reserved"),
  };

  const result = await addProductToCart(
    "cart-1",
    "product-1",
    cartRepo,
    productRepo,
  );

  expect(result).toEqual({ added: true });
  expect(cart.addItem).toHaveBeenCalledWith("product-1");
  expect(cartRepo.save).toHaveBeenCalledWith(cart);
});
```

This test checks the orchestration around the reservation. It verifies that, when the mocked repository says `"reserved"`, the service adds the product to the cart and saves it.

But it says nothing about the part that matters in this example. It does not run the atomic update. It does not prove that two concurrent requests cannot reserve the same last unit. It does not even prove that stock was decremented.

Again, the mock returns the answer we configured it to return. The risky behavior lives behind that mock.

## Conclusion

I hope that, with these two cases, I made clear the thesis that I introduced at the start of the article: integration tests are not an improved version of unit tests, but a different kind of test that allows you to cover cases where unit tests cannot do anything.

In cases where the domain logic resides in a different service, the only way to test the feature fully is to spawn that external service and execute it.

But of course, creating integration tests implies more work than unit tests. If we want to create integration tests now we need to do some work that we did not need for unit tests:

- spawn the external service before the tests run;
- wire the application so it talks to that service instead of a mock;
- clean or isolate the data between tests;
- make sure tests that run in parallel do not update the same records;
- make the setup work locally and in CI;
- keep the runtime low enough that people actually run the suite.

In the next article of this series I will share the best setup for integration tests I have found, and how you can use it to solve all of the above while keeping the runtime reasonably low.

See you there!
