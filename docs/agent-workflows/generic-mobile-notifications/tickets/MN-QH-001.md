# MN-QH-001: Define quiet-hours behavior before implementing it

Status: blocked, proposed follow-up only. Not approved for execution or merge.
Source: quiet-hours requirement preserved from #34 after the user-approved scope split.
Template: `.github/ISSUE_TEMPLATE/feature.yml`. Proposed label: feature.
Merge mode: pr-only, no authorization.

## Description

### Problem and context

#34 requested quiet hours without defining time ranges, timezone, controls, exceptions, or whether alerts should be deferred or dropped. Opted-in users can receive midnight release alerts under the approved initial notification spec. Quiet-hours implementation would otherwise invent product policy.

### This ticket aims to

Preserve that deferred requirement and obtain an approved quiet-hours brief/spec before implementation. It is explicitly excluded from [the initial notification release](../spec.md).

## Scope and exclusions

Resolve policy and consent/settings implications in a separate interactive planning session. No runtime implementation, per-category controls, automatic runner task, or prerequisite for #131 is authorized.

## Acceptance Criteria

- [ ] An owner approves applicable categories, schedule/timezone, controls/defaults, and defer-versus-drop behavior.
- [ ] The eventual brief covers timezone/DST, expiry, account/device settings, and permission-denial cases.
- [ ] An approved specification and plan exist before implementation tickets or execution approval are sought.

## High Risk?

Timezone scheduling and consent. Exact requirements are not yet verified or decided.

## AGaw metadata

Blocker: missing approved quiet-hours policy/spec/plan. No implementor may execute this ticket.
References: source #34; [notification spec exclusion](../spec.md). There is no quiet-hours parent spec or plan yet.
Entry-point hints: account preference and scheduled notification behavior; exact changes must follow later decisions.
Validation: user approval of a separate brief/spec/plan, not unit-test claims.
Risk and rollback: no runtime change is proposed. Preserve #34 history; do not silently suppress the approved daily events.
