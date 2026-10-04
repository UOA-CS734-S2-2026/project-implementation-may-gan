---
title: Who Dayli is for
description: The people Dayli is designed for, how the team identified them, and how their needs shaped specific design decisions.
---

# Who Dayli is for

A product that tries to suit everyone usually suits nobody well. Dayli is built for a specific group of people with a specific problem, and most of its unusual rules make sense once you know who that group is.

## How we identified our users

Dayli began inside the group it serves. The [project's origin](/docs/about-dayli/project-status) was a friend group split across countries by travel and work. As their schedules stopped lining up, keeping up with the ordinary parts of each other's lives got harder. Dayli was meant to give those small updates one place to land without turning them into a live social feed. The team are university students, and the project describes itself as made with students in mind, so the first users' circumstances were familiar from the inside.

That is a real starting point, but it is not research. However, this project already existed as a web app built the semester prior, and had real users with real feedback. The user descriptions below come from real users' experience and from the product decisions written down in `docs/dayli/product-decisions.md` and `docs/dayli/mvp.md`. The last section says what we would do to test them.

## The people Dayli is for

| Group | Who they are | What they need | Where the product answers it |
| --- | --- | --- | --- |
| **Friends kept apart** (primary) | Small friend groups separated by distance, time zones, or busy schedules | To stay in touch with the everyday parts of each other's lives without a live feed or an obligation to reply | One post a day, released to friends after midnight, with a feed that shows the previous day |
| **Students** | University students, the context Dayli was made in | A light daily habit that fits around study, and capture that works on a phone | A one-minute composer, mobile photo, video and voice capture, protected offline drafts |
| **Private journallers** | People who want to write the day down for themselves | A place to reflect with no pressure to share | **Solo** posts, a rating and history, and no default audience |

## What the design takes from those needs

These are documented decisions, each tied to something these users need:

- **Low pressure.** There is one post per day and no live feed. Friends posts are released at the next Auckland midnight, so everyone writes about their own day before reading anyone else's. See [Core concepts and daily rules](/docs/about-dayli/core-concepts-and-daily-rules).
- **Control over who sees what.** The author must choose Friends or Solo for every post, and Dayli never picks for them. Profiles can be public or private, and blocking ends access immediately. See [Privacy and sharing](/docs/using-dayli/privacy-and-sharing).
- **Trust.** Push notifications are generic ("New message on Dayli") and never show content. Camera, microphone and location are asked for only when the author taps the feature that needs them, with an explanation first, and a refusal never stops them posting. Weather is built so the app never receives where the author is. See [Location and weather contexts](/docs/systems/location-and-weather-contexts).
- **Life is not always online.** Mobile keeps drafts in protected storage, and a retried post is safe because it will not be posted twice. See [Creating your daily post](/docs/using-dayli/creating-your-daily-post).
- **One shared day.** Everyone follows the Auckland calendar day, wherever they are. That keeps the "same day for everybody" idea simple.