---
title: Project status
description: Where Dayli came from and what the current repository represents.
---

# Project status

Dayli started as a university team project by:

- Andrew Qiu
- Anton Garay
- Jos Badenas
- Kimberley Zhu
- Grace Xu
- Joohui Lee

The first version was built for COMPSCI 732, Software Tools and Techniques. That course focused on full-stack web development, so the team built a React web application even though the daily journal idea also suited a phone. The original version remains available at [dayli.wdcc.co.nz](https://dayli.wdcc.co.nz).

The project continued in COMPSCI 734, Web, Mobile and Enterprise Computing. The course work expanded the repository into a monorepo with a Next.js web app, a Flutter app, a Hono API, PostgreSQL, and private media storage. Kimberley and Grace were not enrolled in that course, but remain part of Dayli's origin.

The checked-in applications now cover daily reflections, profile history, friends, messages, private media, mobile voice memos, and signed-out browsing of public profiles. Some backend work is intentionally ahead of the interfaces. Likes and comments have active API routes but no complete client experience. Trash remains disabled. Reviewed staging exports are available to all staging accounts through web, with a separate Android staging tester build. Ordinary mobile builds and separate production execution remain disabled; the older synthetic-only proof path is not the current staging mode.

This repository documents implemented code separately from deployed evidence. It has a staging release process, but no documented production application release. See [Architecture overview](/docs/systems/architecture-overview) for the current system and [Planned systems and known gaps](/docs/decisions-and-future-work/planned-systems-and-known-gaps) for unfinished work.
