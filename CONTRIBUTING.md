# Contributing Guidelines

_Team May Gan · COMPSCI 734. Adapted from our COMPSCI 732 standards for the 734 hybrid stack
(Flutter client + Node/GraphQL API + Firebase)._

## Issues

Use the provided issue templates when filing any new issue. Templates exist for bugs, features,
chores, refactors, and tests.

## Pull Requests

Use the pull request template when opening any PR. Fill in all relevant sections before requesting
review. `main` is branch-protected: every change lands via a PR with **at least one approving
review** and passing CI.

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

Run the formatter and linter for **whichever package you touched**, and fix any errors, before
opening a PR:

**Flutter client**

```bash
dart format .        # auto-fix formatting
flutter analyze      # static analysis / lint
flutter test         # unit + widget tests
```

**Node / GraphQL API**

```bash
pnpm format          # auto-fix formatting
pnpm lint            # check for lint errors
pnpm test            # resolver unit/integration tests
```

If CI fails on your PR due to formatting or lint, fix it locally and fold the fix into your last
commit:

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
