---
title: Can people complete the tasks?
description: The core tasks Dayli is designed for, what makes each easy, how failures are handled, and what evidence exists that people can finish them.
---

# Can people complete the tasks?

A feature that exists is not the same as a task people can finish. This page walks through the tasks Dayli is designed around and asks three questions of each. How many steps does the shortest path take? What stops the person from going wrong? What happens when something does go wrong?

It then says how we know, and how much of that knowledge comes from real people.

## The core tasks

| Task | Shortest path | What keeps it simple | If something goes wrong |
| --- | --- | --- | --- |
| **Create an account and sign in** | Username, email and password, then **Let's go**. Or **Continue with Google** where it is configured. | Few fields. Clear rules shown beside them, such as at least 8 characters. | Password recovery. A [help page](/docs/using-dayli/help-and-troubleshooting) covers account problems and Google sign-in. |
| **Post today's dayli** | Open **new dayli**, write an answer, set a rating, pick Friends or Solo, tap **Post**. | Only those three things are required. The prompt is shown, and a countdown shows the time left. | A plain message says whether the person is offline, the window closed, or they already posted. Words stay saved on mobile. A retry cannot post twice. |
| **Add a photo, video, voice memo or weather** | Tap the optional section and choose. | Optional, each in its own section. Permissions are asked for at the tap, with an explanation first. | A refusal never blocks posting. A failed upload can be retried or removed. The weather has a **Skip** button and a place search. |
| **Find a friend and connect** | Search by username, send a request, wait for acceptance. | Search shows enough to start a request without revealing a private profile. | A sent request can be cancelled and a received one declined. Either person can remove the friendship later. |
| **Read friends' days** | Open the daylies feed after midnight. | The feed shows only yesterday's posts, so there is no backlog to scroll. | An empty feed says so. Older posts are on each friend's profile. |
| **Control who sees a post** | Choose Friends or Solo when posting, change it by editing. | No default, so no accidental sharing. | Edits keep earlier versions, and a conflict between devices asks the person to reload the latest. |
| **Message a friend** | Open a conversation with a friend, or send one message request to a non-friend. | Requests protect people from unwanted messages. | A retried send does not duplicate the message. Unsend clears a message's text from the conversation. |
| **Look back and fix a post** | Open **my days**, open a post, choose **Edit**. | The profile shows history and streak. Editing shows every field. | Earlier versions are kept. A post cannot be backdated. |

The shortest posting path is four actions. That is deliberate: the product is meant to take a minute.

## How the design helps people recover

Tasks fail for ordinary reasons: no signal, a missed deadline, a refused permission, a wrong tap. Dayli handles these in specific ways instead of with one generic error.

- **Messages say what happened and what to do.** "You seem to be offline. Try again when you're connected. It won't be posted twice."
- **Nothing the person wrote is thrown away.** A missed deadline keeps the words available to read or copy, and a draft survives restarts on mobile.
- **Optional features cannot block the required task.** Camera, microphone, location and weather all degrade to "post without it". The weather lookup holds the **Post** button for a moment and then releases it, with a **Skip** button for people who would rather not wait.
- **Failures offer a next step.** A refused location permission offers a place search. Settings is offered only when Settings is the only fix.
- **Required choices are explicit.** The audience is never preselected, so a post cannot reach people the author did not mean.

## How we know

Evidence comes in layers, and each layer shows something different.

| Layer | What it shows | What it does not show |
| --- | --- | --- |
| Automated tests (unit, route, widget, PostgreSQL) | Each rule and each error path behaves as designed, including the recovery messages above. | That a person understands the screen. |
| Browser end-to-end tests | Web journeys such as creating an account, signing in and messaging work against real local services. See [End-to-end tests](/docs/development/testing/end-to-end-tests). | Mobile (its smoke test uses fake services), or anyone's first impression. |
| Staging authentication check | Sign-in works on the deployed staging site, when its repository setting is enabled. | Anything beyond sign-in. |
| Recorded manual checks | A person ran a specific flow on staging or a device and wrote down the result. See [Staging and manual checks](/docs/development/testing/staging-and-manual-checks). | Many people, or people unfamiliar with the app. |
| Accessibility checks in widget tests | A few screens expose usable screen-reader text, such as "Rated 8 out of 10". | Real use with assistive technology. |

The weather feature is an example of what has and has not been shown. On October 4, 2026 it was run on an Android emulator against a local API: the explanation, the permission prompt, a refusal, place search, posting, and the detail line all worked. The "use my location" success path timed out on the emulator, and nothing has run on a physical phone or on iOS.

## What we have not done

- **Web and mobile differ.** Mobile drafts and uploads work, while the web composer neither keeps a draft nor sends media. A person who starts on one platform and moves to the other may be surprised.
- **The daily deadline is strict.** A missed day cannot be posted afterwards. That protects the idea of a daily ritual, but it is also the most likely cause of frustration, and we have not tested how people react to it.