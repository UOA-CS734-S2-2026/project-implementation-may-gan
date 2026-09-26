# Contributing Guidelines

_Team May Gan · COMPSCI 734. Standards for the Dayli monorepo: Flutter, Next.js,
Hono on Cloudflare Workers, and PostgreSQL._

## Issues

Use the provided issue templates when filing any new issue. Templates exist for bugs, features,
chores, refactors, and tests.

## Pull Requests

Use the pull request template when opening any PR. Fill in all relevant sections before requesting
review. `main` is branch-protected: every change lands via a PR with **at least one approving
review**. GitHub-hosted PR and push verification is temporarily paused, so there are no automatic hosted test gates.

## Branches

Branch names follow this format:

- **For issue-related work:** `{issue-number}/{description}`
  - e.g. `12/contributing-guidelines`
- **For personal / testing branches:** `{name}/{description}`
  - e.g. `jos/experiment-auth-flow`

_(Bootstrap PRs that predate the first issues may use a `{type}/{description}` name, e.g.
`chore/repo-standards`.)_

## Merging

Always use **rebase and merge** when merging PRs into `main`. Avoid squash merge or regular merge
commits to keep a clean, linear history. Only fall back to a regular merge if there are significant
merge conflicts that make rebasing impractical.

## Before Opening a PR

Run the local verification suite and fix any errors before opening a PR. It requires Node.js 24, pnpm 10, JDK 17, Docker with Compose, Flutter, and Dart:

```bash
pnpm verify:local
```

Use the full mode when a debug Android APK is required:

```bash
pnpm verify:local:full
```

Record the verified commit SHA and sanitized command output in the PR or approved evidence location. This local check uses only an isolated Docker PostgreSQL fixture. It is not a staging, Neon, or Cloudflare proof.

If local verification finds formatting or lint failures, fix them and fold the fix into your last commit:

```bash
# (formatter) …
git add .
git commit --amend --no-edit
git push --force-with-lease
```

`--force-with-lease` is a safe force push — it refuses to overwrite if someone else has pushed to
your branch since you last pulled.

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/) with **no scope**. Use the type
prefix only:

```
feat: add daily post composer
fix: reject a second post on the same local day
chore: update dependencies
docs: add architecture section
refactor: extract feed visibility check
test: add integration tests for the unlock flow
style: format files
```
