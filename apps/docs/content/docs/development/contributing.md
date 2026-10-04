---
title: Contributing
description: Make a focused Dayli change, prove what you checked, and take it through review safely.
---

# Contributing

A shared repository is a group project with a very long memory. Branches stop unfinished work from changing `main`. Tests catch mistakes before they reach everyone else. Review gives another person enough context to question the change, reproduce it, and approve it.

The process is not ceremony for ceremony's sake. It lets us change the same product without guessing which code is safe, which result belongs to which commit, or whether someone else's work was overwritten.

Dayli accepts changes to `main` through pull requests. Keep each change focused, explain why it is needed, run the relevant checks, and make the evidence honest about what it proves.

## Start from an issue and a branch

Use the repository's issue templates for bugs, features, chores, refactors, and tests. A useful issue gives the team one place to agree on the problem before code starts moving around.

Issue branches use this format:

```text
{issue-number}/{description}
```

For example:

```text
12/contributing-guidelines
```

Personal or experimental branches use your name instead:

```text
{name}/{description}
```

For example:

```text
jos/experiment-auth-flow
```

Older bootstrap work may use `{type}/{description}`, but new issue work should use the issue-number format.

Create your branch from an up-to-date local `main`:

```bash
git switch main
git pull --ff-only
git switch -c 123/short-description
```

`--ff-only` stops the pull instead of creating a surprise merge commit when local and remote history differ. If it stops, inspect the branch before choosing how to reconcile it.

## Make one understandable change

Read the nearby implementation and tests before editing. Follow the existing owner for the behavior rather than adding a second pattern. The [Repository structure](./repository-structure) guide helps locate the owner, and [Backend architecture](./backend-architecture) explains API feature boundaries.

While working:

- keep generated output tied to the source change that produced it
- add or update the narrow test that proves the changed behavior
- avoid unrelated formatting or refactors in the same pull request
- never commit secrets, local environment files, credentials, private test data, or copied staging output
- check `git diff` and `git status` before staging

Stage named files when other work is present in the same checkout:

```bash
git add path/to/changed-file path/to/test-file
git diff --cached
```

A focused diff is kinder to reviewers and to your future self, who will absolutely forget why an unrelated rename appeared three weeks later.

## Commit messages

Dayli uses [Conventional Commits](https://www.conventionalcommits.org/) with no scope. Write the type, a colon, and a short description:

```text
feat: add daily post composer
fix: reject a second post on the same local day
docs: explain backend feature ownership
refactor: extract feed visibility check
test: add integration tests for the unlock flow
chore: update dependencies
style: format files
```

Do not add a scope such as `feat(api):`. The repository convention is `feat:`.

Use the type that describes the change, not the issue label you happened to start from. A commit should be understandable on its own and should leave the repository in a reviewable state.

## Test the right boundary

Start with the smallest check that can fail for your change. A pure rule needs a unit test. A query or transaction needs PostgreSQL integration. A browser journey needs more than a component test.

The [Testing guide](./testing) maps features to commands and explains their limits. Before opening a pull request, the contribution policy asks for the broad local suite:

```bash
pnpm verify:local
```

Use full mode when the change needs a debug Android APK build:

```bash
pnpm verify:local:full
```

These commands require Node.js 24, the repository's pinned pnpm 10 version, JDK 17, Docker with Compose, Flutter, and Dart. They use an isolated local PostgreSQL fixture. A pass is not evidence about staging, Neon, Cloudflare, or a physical device.

If you cannot run the broad suite, do not turn a smaller check into a bigger claim. Record exactly what ran, its result, and what remains for CI or another reviewer.

## Record evidence without leaking data

Verification evidence should identify the exact code it belongs to. Record the commit SHA after the tested changes are committed:

```bash
git rev-parse HEAD
```

Include the command, pass or fail result, and sanitized useful output in the pull request or approved evidence location. Remove credentials, cookies, tokens, database URLs, private content, and environment-specific values. Do not paste a terminal dump without reading it first.

Keep authorship and verification accurate:

- If you ran a command yourself, say that you ran it and report its result.
- If a coding agent reports a check, say that the agent ran it. Do not rewrite that as personal testing.
- If CI has not run for the commit, say it is pending. A workflow file in the repository is not a passing run.
- If a reviewer performs a manual check, record who checked it, the revision, steps, result, and limits without exposing account data.

Evidence belongs to a commit. If code changes afterward, rerun the affected checks and update the SHA rather than attaching an old green result to new code.

## Open the pull request

Push your branch normally:

```bash
git push -u origin HEAD
```

Open a pull request into `main` and use `.github/PULL_REQUEST_TEMPLATE.md`. The current template asks for:

1. A concise description of what the pull request does and why, plus the closing issue number.
2. One selected change type: Feature, Bug fix, Refactor, Test, or Chore / config.
3. A bullet list of key changes.
4. Reproducible test steps, including relevant environment variables, seed commands, test accounts, or target mobile platform when needed.
5. Any notes a reviewer needs.

Documentation-only work does not have its own checkbox in the template. Choose the closest available type, usually Chore / config, and describe the documentation change plainly.

Write test instructions that a reviewer can follow. Separate automated commands from manual steps, and name anything you did not check. Credentialed Hyperdrive or staging proof stays in its reviewed workflow rather than being copied into a local command.

## Current automatic checks

The root contribution file still says GitHub-hosted verification is temporarily paused, but that statement conflicts with the checked-in CI configuration. For the configured triggers and jobs, inspect `.github/workflows/ci.yml`: it triggers on pull requests, merge queues, pushes to `main`, and manual dispatches. Repository settings can still disable Actions, so confirm the pull request has a current run before treating CI as active or passing.

Its current jobs are:

- `CI / TypeScript`
- `CI / Web E2E`
- `CI / Contracts and Flutter`
- `CI / PostgreSQL integration`

The jobs cover linting, type checks, workspace tests and builds, local Worker checks, browser journeys, generated clients, Flutter checks and an Android debug build, and isolated PostgreSQL verification. Pull request CI has read-only repository access. It does not receive deployment credentials and does not deploy or prove staging.

The workflow definition shows what should run. Only the GitHub Actions run for your pull request commit shows what did run. Check the pull request before claiming that hosted verification passed.

## Review and merging

`main` is branch-protected. Every change lands through a pull request with at least one approving review. Respond to review comments with the code change or with a concrete explanation when you disagree. Re-request review after material changes.

Dayli uses rebase and merge for pull requests into `main`. Do not squash merge or create a regular merge commit for routine work. The contribution policy allows a regular merge only when substantial conflicts make rebasing impractical.

If `main` moves while your pull request is open, first fetch and inspect the situation:

```bash
git fetch origin
git log --oneline --decorate --graph --max-count=20 HEAD origin/main
```

On your own feature branch, you may rebase onto the updated target:

```bash
git rebase origin/main
```

After a successful rebase, the remote feature branch has the old history. Update only your own branch with:

```bash
git push --force-with-lease
```

`--force-with-lease` refuses to overwrite a remote update that you have not fetched. It is still a history rewrite, so use it only when you deliberately rebased your personal feature branch. Never force-push `main`, and do not rewrite a shared branch until its collaborators agree.

If someone else updated the branch, stop and inspect their commits. Do not use a blind force push, and do not amend or drop someone else's work to make the graph look tidy.

## Before requesting the final review

Check these items against the actual pull request:

- The branch name follows the issue or personal branch convention.
- The diff solves one stated problem and contains no secrets or unrelated files.
- Commit messages use Conventional Commits with no scope.
- Relevant focused tests pass, or their gaps are stated.
- `pnpm verify:local` passed for the recorded commit, or the missing local gate is explicit.
- Generated clients or other checked-in outputs were regenerated when their source changed.
- The pull request template has a clear reason, change list, and reproducible test steps.
- CI status is reported from the current commit's run, not assumed from configuration.
- At least one approving review is present before merge.
- The pull request will use rebase and merge into `main`.

Good contribution notes are pleasantly boring. A reviewer should know what changed, why it changed, how to check it, and what remains uncertain without opening six terminal tabs and conducting archaeology.
