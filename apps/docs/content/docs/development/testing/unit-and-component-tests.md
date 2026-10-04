---
title: Unit and component tests
description: Write focused tests for Dayli domain logic, API behavior, React components, and Flutter widgets.
---

# Unit and component tests

A **unit test** checks a small piece of logic on its own. A **component test** checks a piece of the interface by interacting with its controls and checking the result. Flutter calls its interface checks **widget tests**.

These tests matter because a small change can break something without stopping the app from running. They give us quick, repeatable checks while we're working, without starting every service and clicking through every screen. Less "surely that still works", more checking that it actually does.

Dayli uses unit tests for rules such as calculating the Auckland posting day and rejecting a second daily post. We use component and widget tests for features such as username search on web and displaying the feed on mobile.

For example, search can display the right person but link to the wrong profile. Our web component test supplies a sample result, types into the search box, and checks the result's name and destination. That catches a broken link without needing a real account or API server. It doesn't prove that the deployed search API works, which is why we also need the other [test layers](./).

Keep the code you're checking real. Replace dependencies outside that check, such as the clock, database access, network client, or router, with controlled test versions. These replacements are called fakes or mocks. They let us choose the situation we're testing, including failures that would be awkward to reproduce by hand.

## Where Dayli uses these tests

We use unit tests for rules that need to stay correct regardless of which app calls them. That includes working out the Auckland posting day in `packages/domain/src/auckland-day.test.ts` and rejecting a second daily post in `apps/api/src/features/posts/create-post/create-post.service.test.ts`.

We use component tests where the result depends on what someone sees or does on a screen. Username search is covered in `apps/web/components/ui/layout/NavSearch.test.tsx`. The mobile feed is covered in `apps/mobile/test/home_feed_test.dart`, including showing posts and loading another page.

The examples below walk through those situations, starting with why each check matters.

## Give the test a clear job

Start with a specific problem. For example, "typing a username shows a result, but the result links to the wrong profile". The test should fail if that bug comes back, not just confirm that an internal function ran.

A useful test reads as three steps:

1. Arrange the input and controlled dependencies.
2. Act through the public function, HTTP route, user control, or widget.
3. Assert the result a caller or user can observe.

Checking a mock call can support that final assertion, but it should not be the only proof when a response, state change, or rendered result is available.

## Run one current test file

These commands run from the repository root. They avoid relying on argument forwarding through package scripts.

```bash
# Domain logic with Node's test runner
node --import tsx --test packages/domain/src/auckland-day.test.ts

# API service behavior with the API Vitest configuration
pnpm --filter @dayli/api exec vitest run src/features/posts/create-post/create-post.service.test.ts

# React component behavior with the web Vitest configuration
pnpm --filter @dayli/web exec vitest run --config vitest.config.ts components/ui/layout/NavSearch.test.tsx

# Flutter widget behavior
cd apps/mobile
flutter test test/home_feed_test.dart
```

Run the package command when you want the whole nearby suite:

```bash
pnpm --filter @dayli/domain test
pnpm --filter @dayli/api test
pnpm --filter @dayli/web test
cd apps/mobile && flutter test
```

## Domain logic: which day does a post belong to?

Dayli gives everyone one post per Auckland calendar day. To enforce that rule, we need to know when the day starts and when the next midnight happens. Getting that wrong could close someone's posting window too early or keep yesterday's window open too long.

The tricky part is daylight saving. An Auckland day can be 23 or 25 hours long, so finding tomorrow's midnight isn't always a matter of adding 24 hours.

This is a good job for a unit test. We can give the date calculation a specific time and check its answer without opening the app or waiting for daylight saving to happen. Passing in a clock means the test chooses what "now" is without changing the computer's clock.

Dayli does this in `packages/domain/src/auckland-day.test.ts`. Here is a shortened check for the spring transition:

```ts
const day = createAucklandDayService({
  now: () => new Date("2026-09-27T00:30:00Z"),
}).current();

equal(day.localDate, "2026-09-27", "local date");
equal(day.startUtc.toISOString(), "2026-09-26T12:00:00.000Z", "start UTC");
equal(day.nextMidnightUtc.toISOString(), "2026-09-27T11:00:00.000Z", "next midnight UTC");
```

This asserts calendar behavior, not that the clock function was called. When code depends on the current posting day, inject a fixed clock and place cases immediately before and at Auckland midnight. Do not add 24 hours to find the next day because Auckland daylight-saving transitions make that assumption false.

Place domain tests beside their source in `packages/domain/src` and name them `*.test.ts`. This package uses Node's test runner and small local assertion helpers, not Vitest globals.

## API services and routes: can someone post twice?

A disabled Post button isn't enough to enforce one post a day. Someone could submit from two app windows or send a request directly to the API. The backend needs to reject a second post too.

First, we can check the posting service's decision without involving a real database. The test accepts one post, tries another for the same author and day, and expects a rejection with only one post stored. It uses an in-memory store, a fixed clock, and predictable IDs so the situation is repeatable.

Dayli covers this in `apps/api/src/features/posts/create-post/create-post.service.test.ts`. The important part of the test is:

```ts
await service.createDailyPost("author-1", "key-1", input);

await expect(service.createDailyPost("author-1", "key-2", input))
  .rejects.toMatchObject({ reason: "ALREADY_POSTED" });
expect(memory.posts).toHaveLength(1);
```

That negative case matters. A happy-path assertion alone would not prove the one-post-per-day rule. Permission and ownership changes should cover an allowed caller and at least one denied caller. Current media tests, for example, verify that one author cannot attach another author's upload and that no post is stored after rejection.

The API also needs to stop people who aren't signed in from sending friend requests. A service test alone doesn't tell us whether the HTTP route actually enforces that check.

For that, a route test sends a request through the Hono app without a session and checks that the caller receives `401`, meaning authentication is required. Dayli uses this check in `send-friend-request.route.test.ts`:

```ts
const response = await createApp().request(
  "/api/v1/relationships/requests",
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recipientId: "u1" }),
  },
);

expect(response.status).toBe(401);
```

A mock saying that session lookup ran would be weaker. The status is what an API caller receives.

Our target API convention is to put test suites in an `__tests__` directory under the code's owner. Messaging already follows it, while moving the remaining API tests is pending. Until that refactor updates the files and runner configurations, the commands and example paths on this page refer to the current locations.

For the full target layout, see [Backend architecture](../backend-architecture). Shared test helpers stay in `apps/api/test/support`, and architecture fixtures stay in `apps/api/test/boundaries`; they are not test suites. Web, mobile, and shared-package layouts are unchanged.

Use `.repository.integration.test.ts` for a test that requires PostgreSQL, and do not disguise one as a unit test by connecting to a developer database.

The ordinary API test command uses the Cloudflare Vitest plugin but mocks network and storage dependencies in focused tests. Never use a production or staging URL in one of these tests. Inject a fake client, mock `fetch`, or use a local in-memory store.

## React components: does a search result lead to the right person?

Finding friends starts with username search. Returning the right data from the API isn't enough if the search box doesn't display it, or if clicking the result opens the wrong profile.

A component test checks that connection between the data and the interface. We supply a sample search response, type into the real search component, and check the visible result and its destination. No real account or deployed API is needed.

Dayli uses React Testing Library in a simulated browser environment called jsdom for these checks. In `apps/web/components/ui/layout/NavSearch.test.tsx`, the sample person is Ada Lovelace, with the username `messages`. The test checks that her result links to `/u/messages`:

```tsx
render(
  <QueryClientProvider client={client}>
    <NavSearch />
  </QueryClientProvider>,
);

const input = screen.getByRole("textbox", { name: "search users" });
fireEvent.change(input, { target: { value: "ad" } });

expect(await screen.findByRole("option", { name: /Ada Lovelace/i }))
  .toHaveAttribute("href", "/u/messages");
```

This checks the accessible option and destination that a person can use. An assertion only on `searchFriends("ad")` would miss a broken result label or link.

Search also waits briefly after typing before sending a request, rather than making one for every keystroke. That delay is called a debounce. We want to check it without making the test sit and wait in real time.

The same file controls the 300 ms delay with `vi.useFakeTimers()`. Restore real timers during cleanup, preferably with `try` and `finally`, so a failure cannot affect another test:

```ts
vi.useFakeTimers();
try {
  fireEvent.change(input, { target: { value: "no" } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
} finally {
  vi.useRealTimers();
}
```

The shared web setup already calls React Testing Library's `cleanup` after each test. A test that creates other resources, such as a `QueryClient`, listener, stream, or spy, still owns any extra cleanup it needs.

Put a component test beside its component as `*.test.tsx`. Broader feature components also live under `apps/web/tests`. Follow the nearest existing layout rather than moving unrelated tests. Mock API modules at that boundary so component tests cannot call a deployed service.

## Flutter widgets: can someone read the next page of their feed?

The mobile feed loads posts in pages. If loading another page replaces the first one or never displays the new posts, someone could miss part of their friends' day even though the API returned everything correctly.

A widget test can supply two pages of sample posts, show the feed, and tap its load-more control. Then it checks that the first post was shown and the next page appears after the tap. This checks the mobile interface without needing a device or a real backend.

Dayli covers this in `apps/mobile/test/home_feed_test.dart`, using a fake feed client and signing in through the test interface:

```dart
await signIn(tester, harness);

expect(find.text('Baked bread.'), findsOneWidget);
expect(find.byKey(const Key('home.empty')), findsNothing);

await tester.tap(find.byKey(const Key('home.feed.more')));
await tester.pumpAndSettle();

expect(find.text('Read half a novel.'), findsOneWidget);
```

Flutter unit tests belong in `apps/mobile/test` and use `test`. Interface checks use `testWidgets` and interact through `WidgetTester`.

Prefer text, semantic labels, widget types, and stable keys that represent user-visible behavior. Avoid finding a widget by a private implementation detail when a label or key expresses its purpose.

People using a screen reader also need to understand the profile's counts. Seeing a number on screen doesn't prove that its accessibility label says what it counts. Dayli checks those labels in `profile_details_test.dart`:

```dart
final semantics = tester.ensureSemantics();
expect(find.bySemanticsLabel('4 Posts'), findsOneWidget);
expect(find.bySemanticsLabel('13 Friends'), findsOneWidget);
semantics.dispose();
```

Controller tests should await every asynchronous operation before asserting. `composer_controller_test.dart` also uses `fakeAsync` for the posting deadline. It advances virtual time across the server-provided deadline and verifies that the draft becomes missed rather than waiting nine real hours. Dispose controllers and close streams or subscriptions created by a test.

Fake clients in `test/support/fakes.dart` keep host tests off the network. If a feature needs the real app process or a platform plugin, it belongs in `integration_test`, not in the unit suite.

## Before adding a test

Ask what failure the test should catch. Then keep its boundary explicit.

- Assert the public result, persisted in-memory state, HTTP response, navigation, or rendered content.
- Add negative permission and ownership cases for protected behavior.
- Await promises, Flutter futures, user events, and timer advancement before asserting.
- Give each test its own mutable state. Reset mocks, clocks, and global overrides.
- Use `afterEach`, `finally`, or the framework teardown hook for cleanup that must happen after a failed assertion.
- Keep network calls behind fakes or mocks. Unit and component tests must not depend on production or staging availability.

## What these tests do not prove

These tests do not prove SQL migrations, database constraints, restricted PostgreSQL roles, real workerd service bindings, browser behavior in a running Next.js app, or behavior on a physical device. They also do not prove deployed Cloudflare, Neon, Google, email, or push configuration.

Use the next boundary from the [testing overview](./) when the behavior depends on one of those systems. A focused test is valuable because it is fast and precise, not because it can replace every other layer.
