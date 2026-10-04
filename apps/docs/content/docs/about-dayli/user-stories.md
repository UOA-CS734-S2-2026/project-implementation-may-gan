---
title: User stories and how the app supports them
description: The stories Dayli is built to satisfy, how each is supported today, the evidence behind that claim, and what is still missing.
---

# User stories and how the app supports them

A user story says what a person wants and why, in one sentence. It is a useful test of a product: for each story, can the person do it today, how do we know, and what gets in the way?

The status column uses three words:

- **Supported:** a person can complete the story in the apps that exist today.
- **Partly supported:** part of the story works, and the gap is named.
- **Not yet:** the story is planned or only partly built behind the scenes.

"Evidence" means automated tests and documented checks. It does not mean testing with real users, which has not been done. See [Can people complete the tasks?](/docs/about-dayli/task-completion).

## The daily ritual

| Story | Status | How the app supports it | Evidence |
| --- | --- | --- | --- |
| As a member of a friend group, I want to answer one prompt and rate my day, so that keeping up takes a minute. | Supported | The composer asks for an answer, a 1 to 10 rating and an audience. Everything else is optional. | Posting-day and post route tests, composer widget tests |
| As someone who writes late, I want to see how long I have left, so I do not miss the day. | Supported | A countdown in the composer. The server decides whether the day is still open. | Deadline tests in the posting service and composer controller |
| As a student on the move, I want a half-written post saved, so closing the app does not lose it. | Partly supported | Mobile saves drafts in protected storage. The web composer does not keep a draft across a refresh. | `composer_controller_test.dart`, `draft_store_test.dart` |
| As someone with a poor connection, I want to retry without posting twice. | Supported | Every submission carries a key, and an identical retry returns the original post. | Idempotency tests in the API and the mobile submitter |
| As someone who captures moments, I want to add photos, a short video or a voice memo. | Partly supported | Works on mobile when media uploads are configured. The web composer selects files but does not send them. | Media, camera and voice memo tests |
| As someone who remembers what the day was like, I want to add the weather without telling Dayli where I am. | Supported on mobile | An optional section with an explanation first, an approximate location read once, and only the weather, temperature and place name stored. | API, database and Flutter tests. |

## Control over who sees what

| Story | Status | How the app supports it | Evidence |
| --- | --- | --- | --- |
| As an author, I want to choose Friends or Solo for each post, so I decide who reads it. | Supported | No default audience. The author must choose, and can change it later. | Validation and edit tests |
| As someone who values privacy, I want my profile to be private or public. | Supported | Profile visibility, with released Friends posts readable without an account only on public profiles. | Permission predicate and public route tests |
| As someone who feels uncomfortable with another user, I want to block them. | Supported | Blocking ends friendships and pending requests and hides content in both directions. | Relationship and block tests |
| As a reader of a feed, I want hidden posts to stay hidden. | Supported | Visibility is enforced in the database query, not only in the interface. | PostgreSQL permission integration tests |

## Staying in touch

| Story | Status | How the app supports it | Evidence |
| --- | --- | --- | --- |
| As someone with friends elsewhere, I want to find them by username and send a request. | Supported | Username search, requests, accept and decline. | Relationship route tests and friends controller tests |
| As a friend, I want to read what my friends wrote yesterday, after I have written my own day. | Supported | Friends posts are released at Auckland midnight, and the feed shows the previous day. | Feed and release-time tests |
| As a reader, I want to react to a friend's day. | Supported | Likes, comments and one level of replies for the author and active friends, in both clients. | `post_interactions_test.dart` and API interaction tests |
| As a friend, I want to message someone privately. | Supported | Message requests, conversations, read state and generic notifications. Messages are not end-to-end encrypted. | Messaging controller, route and PostgreSQL tests |

## Mobile features

- Users can post personal and heartfelt, or completely unserious voice memos for their friends to listen to, wherever they are. Bring the emotion past the text!
- Have friends that keep showing up in random places, and you never know what they're doing? The weather and location feature can also show you where they are, how cold or hot it is. Message them to ask if the snow was pretty!

## Looking back

| Story | Status | How the app supports it | Evidence |
| --- | --- | --- | --- |
| As a journaller, I want to browse and reread my past days. | Supported | A profile archive and full post detail with the stored prompt and rating. | Profile and detail tests |
| As someone who notices a mistake, I want to correct a post without losing the original. | Supported | Editing keeps earlier versions and detects conflicts between devices. | Edit and revision tests |
| As someone tracking how I feel, I want to see my mood over time. | Supported | Mood history for the owner and active friends. | `mood_history_test.dart` and the mood route and PostgreSQL tests |
| As a returning user, I want to read yesterday's note to myself or see what I wrote a year ago. | Not yet | Tomorrow notes, On This Day and future-self notes are stored or served by the API, but have no client screens. | API tests only |

## Getting into the app quickly

| Story | Status | How the app supports it | Evidence |
| --- | --- | --- | --- |
| As an iPhone or Android user, I want to open today's composer from a shortcut. | Supported on mobile | Siri and Shortcuts on iOS, a launcher shortcut on Android, and a `dayli://` link, with a rating that can be preselected. | `composer_entry_points_test.dart`. Device checks are documented separately |

## What this adds up to

Most stories at the heart of the idea are supported: the daily ritual, the audience choice and the friends feed, plus history and editing. The unfinished ones are about looking back in richer ways. Tomorrow notes, On This Day, search, calendar browsing and recaps are the largest gap between what the plan describes and what a user can do today.

Drafts and media work well on mobile but not on web. See [Planned systems and known gaps](/docs/decisions-and-future-work/planned-systems-and-known-gaps) for the open items.
