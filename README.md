<p align="center">
  <img src="docs/assets/dayli-icon.png" width="128" alt="Dayli logo" />
</p>

<h1 align="center">Dayli</h1>

<p align="center">A daily reflection app made by a COMPSCI 734 student team.</p>

<p align="center">
  <a href="https://staging.dayli.agroupforcoders.com">Try the staging app</a>
  ·
  <a href="https://dayli-docs.agroupforcoders.com/docs">Read the docs</a>
</p>

Dayli gives people a small place to pause at the end of the day. Write a reflection, rate the day, then choose whether to keep it private or share it with friends. The project includes web and mobile clients, one API, and the documentation that explains how the pieces fit together.

## Start here

- [Staging](https://staging.dayli.agroupforcoders.com) is the shared development app. Its content and availability can change while the team is working.
- The [Dayli docs](https://dayli-docs.agroupforcoders.com/docs) explain how to use, build, operate, and review the project.
- [Team records](https://dayli-docs.agroupforcoders.com/docs/team) contain reconstructed weekly progress logs, the task breakdown and assignments, and a template for future meeting minutes. The [source](apps/docs/content/docs/team/index.mdx) explains the limits of the reconstruction.
- The deployed docs can lag the current pull request. Read the [docs source](apps/docs/content/docs/index.mdx) for the version in this repository.

## Developing Dayli

New to the project? Start with the [local setup guide](https://dayli-docs.agroupforcoders.com/docs/development/local-setup). It explains the prerequisites and local HTTPS setup before you run the apps. Install the locked dependencies from the repository root with:

```bash
pnpm install --frozen-lockfile
```

Then follow the docs for [repository structure](https://dayli-docs.agroupforcoders.com/docs/development/repository-structure), [testing](https://dayli-docs.agroupforcoders.com/docs/development/testing), and [contributing](https://dayli-docs.agroupforcoders.com/docs/development/contributing). The root [CONTRIBUTING.md](CONTRIBUTING.md) records the repository's pull request and verification policy.

## Repository layout

- `apps/web`: Next.js browser app
- `apps/mobile`: Flutter mobile app
- `apps/api`: Hono API on Cloudflare Workers
- `apps/docs`: Next.js and Fumadocs documentation site
- `packages/`: shared domain rules, database code, contracts, generated clients, and legal content

## Contributors

### Current COMPSCI 734 team

- Andrew Qiu (`aqiu604`)
- Anton Garay (`agar830`)
- Jos Badenas (`jbad180`)
- JooHui Lee (`eejl391`)

### Original contributors

- Kimberley Zhu
- Grace Xu

## Team image

![Dayli contributors](./team-image.png)
