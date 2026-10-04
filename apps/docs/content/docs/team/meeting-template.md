---
title: Meeting template
description: Capture dated team meetings and issue-linked actions as they happen.
---

Copy this template into a new page named `YYYY-MM-DD.md` under `apps/docs/content/docs/team/`. Add its filename to this section's `meta.json` and link it from the team records index. Fill in the actual meeting details and open a documentation PR after the meeting.

```markdown
---
title: Team meeting YYYY-MM-DD
description: Decisions and actions from the Dayli team meeting.
---

Date and time: YYYY-MM-DD, HH:MM (Pacific/Auckland)
Location:
Attendees:
Absent:
Scribe:

## Progress since last meeting

- Name: brief update with issue or PR links.

## Decisions

- Decision, reason, and link to the relevant product or system document.

## Blockers

- Blocker, affected issue, and who will follow up.

## Actions

| Owner | Action | Issue | Due |
| --- | --- | --- | --- |
| Name | Specific next step | #number | YYYY-MM-DD |

## Next meeting

Date, time, location, and next scribe.
```

Keep product rules in the relevant system or decision document and link to them from the minutes. Give every action an owner and an issue link; use a deadline only when the team has agreed one.
