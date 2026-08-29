# Dayli — Architecture & Technical Design

_Team May Gan · COMPSCI 734 · S2 2026_
_Andrew Qiu (aqiu604) · Anton Garay (agar830) · Jos Badenas (jbad180) · JooHui Lee (eejl391)_

> This document is written against the twelve assessment questions in **Project Implementation &
> Project Management**. Each section names the rubric question(s) it answers; a coverage map is at
> the end. It is a living document — decisions marked 🔵 are provisional and revisited as we build.

---

## 1. What Dayli is (the user need — Q4)

**One post per day, unlocked together.** Each user submits **one post before midnight**; at midnight
all posts unlock at once, but **only users who posted can see the feed**. That participation gate is
the product — it converts passive scrolling into a shared daily ritual.

A post = photo(s) or a short video · a **day rating /10** · a response to the **shared daily prompt** ·
optionally "what are you looking forward to tomorrow?".

**Target users:** NZ university students, 18–25, whose friend groups have scattered. NZ-only is a
deliberate constraint — **one timezone** makes "before midnight" and "unlock at midnight" coherent,
and it is what makes the whole unlock mechanism (§4) a single clean event rather than per-user math.

**Key user stories the system must support:**

- _As a user, I post my day in seconds so it doesn't disrupt my routine._
- _As a user, I only see my friends' days if I showed up myself._
- _As a user, I'm reminded to post before the window closes, and told when the feed unlocks._
- _As a user, I reflect on my mood over time (ratings + context) on a bigger screen._

Dayli already shipped as a **web app** (COMPSCI 732). For 734 we are building a **native Flutter
client fresh**, using the prior version only as a design reference, and re-architecting the backend
around what a mobile-first, event-driven product actually needs.

---

## 2. System overview — mobile + web + cloud (Q1, Q6, Q11)

Dayli is a **three-plane hybrid**. The design principle is *right tool for the job*: Dayli's data has
two natures, and each sits where it is strongest.

- **Relational, integrity-critical data** (posts, the one-per-day rule, friend graph, nested comments)
  → **PostgreSQL**, served through a **GraphQL** API.
- **Identity, push & scheduled events** (auth tokens, "unlock", "you haven't posted yet")
  → **Firebase** (Auth · Cloud Messaging · Scheduler · Functions).

```
        ┌───────────────────────────────┐        ┌──────────────────────────┐
        │  FLUTTER APP  (iOS + Android)  │        │  NEXT.JS WEB (reflection)│
        │ camera · sensors · biometrics  │        │  year-in-review · mood   │
        └───────┬────────────────┬───────┘        └───────────┬──────────────┘
                │ Firebase SDK   │ GraphQL (typed via codegen)  │ GraphQL
                │ (ID token)     │                              │
        ┌───────▼──────┐   ┌─────▼──────────────────────────────▼─────┐
        │   FIREBASE   │   │        GraphQL API  (Node + TS)          │
        │ Auth · FCM   │   │  resolvers · Zod validation · authz      │
        │ Scheduler    │   │  depth/complexity limiting · subs (WS)   │
        │ Functions    │   └──────────────────────┬───────────────────┘
        │ Storage      │                          │ Drizzle ORM
        └──────┬───────┘                   ┌──────▼───────┐
               │ verify ID token           │  PostgreSQL  │  ← system of record
               └──────────────────────────►│ UNIQUE(user, │    "one post/day" is a
                 midnight unlock → FCM      │  local_date) │    DB constraint, not app code
                 fan-out to N users         └──────────────┘
```

**Why separate mobile and web apps (Q1).** They are not duplicates — they divide by *mode of use*:
**capture on mobile, reflect on web.** Mobile owns the in-the-moment actions that need device
hardware (camera, sensors, push, biometrics). Web owns the large-screen reflective surface
(year-in-review, mood history, public share links). Both consume the **same GraphQL API**, so there
is one source of truth and no contract drift.

---

## 3. Technology stack & rationale (Q1, Q2, Q6)

| Layer | Choice | Why this, and where it maps in the course |
|---|---|---|
| **Mobile** | **Flutter** + **Riverpod** | Single codebase, true iOS+Android parity. Riverpod for async/state — pairs cleanly with GraphQL streams. |
| **Client data** | **`graphql_flutter`** + **`graphql_codegen`** | Codegen produces **typed Dart** from the schema — a schema change becomes a **compile error in the app**, restoring end-to-end type safety across the Dart↔TS boundary. |
| **API style** | **GraphQL** | The feed is one deeply nested read (feed → posts → media + author + comment tree). GraphQL fetches it in **one round-trip** and kills the over/under-fetching that REST forces (REST vs GraphQL, Lec 08). Subscriptions carry DMs/presence. |
| **API server** | **Node + TypeScript** (GraphQL Yoga / Apollo) | Keeps one language on the server; mirrors the course's Express example server. |
| **Validation** | **Zod** on every resolver input | Runtime validation at the trust boundary — feeds the security story (Q9). |
| **Database** | **PostgreSQL** (Neon / Supabase) | The gate is enforced as a **`UNIQUE(user_id, local_date)`** index — the database itself rejects a second post. Relational integrity we can demo. |
| **ORM** | **Drizzle** | Typed schema + queries; migrations committed as SQL and code-reviewed. |
| **Identity** | **Firebase Auth** | Google + email sign-in; issues an ID token (JWT) verified server-side by the Firebase Admin SDK. One provider that also unlocks FCM. |
| **Push / events** | **FCM + Cloud Scheduler + Cloud Functions** | The **event-driven unlock** (§4). One event fans out to N users — the justified alternative to polling (Firebase, Lec 09). |
| **Realtime DMs** | **GraphQL subscriptions** (WebSockets) | Presence, typing, read receipts on the same API surface. |
| **Media** | **Firebase Storage** + resize Function 🔵 | Coherent with the Firebase plane. (Cloudinary is the alternative if on-the-fly derived sizes for the scrapbook look prove necessary.) |
| **Web** | **Next.js**, same GraphQL API | The reflection surface; share links = public read-only queries. |
| **Testing** | Flutter `flutter_test` + `integration_test`/**Patrol**; **Vitest** per resolver | Widget + integration + resolver unit tests (Q8, Lec 07). |
| **CI / Deploy** | **GitHub Actions** · Fly.io/Cloud Run (API) · Vercel (web) · Firebase | CI gate on PRs; deploys from `main`. |

**Initiative beyond the course (Q3).** Items not covered in class that we are researching and
applying deliberately: **GraphQL schema→Dart codegen** for cross-language type safety;
**end-to-end encrypted messaging** with a proper threat model (§6); **GraphQL depth/complexity
limiting** as a DoS mitigation; **event-driven fan-out** via FCM topics; **biometric app-lock**. Each
is included because it measurably improves the product, not for novelty.

---

## 4. The event-driven unlock (Q5, Q6, Q11 — the architectural centrepiece)

This is the mechanism we most want assessors to scrutinise, because it justifies the whole
event-driven choice.

1. **Cloud Scheduler** fires a **Cloud Function** at **00:00 NZT**. Because Dayli is single-timezone,
   midnight is *one* global event — no per-user scheduling.
2. The Function flips the day's posts to `unlocked` and **publishes a single unlock event**.
3. **FCM fans it out** to an unlock topic that today's posters are subscribed to: **one event → N
   notifications**. No client ever polls "is it midnight yet?".
4. A second scheduled Function sends the **"window closing, you haven't posted" nudge** and the
   **"on this day last year"** re-engagement push.

**Why it's the right architecture (and scales):** polling is O(N clients × frequency) of wasted
requests; event fan-out is O(1) trigger → N pushes, and the push layer is a managed cloud service
that scales independently of our API. This is the answer to "justify your architecture / show
cloud-native thinking."

---

## 5. Two independent auth layers (Q9)

Kept deliberately separate — a common design error is to conflate them:

- **Account identity** = **Firebase Auth** → ID token → GraphQL verifies via Admin SDK. _Who you are._
- **App-open gate** = **`local_auth`** (Face ID / fingerprint), entirely on-device. _Is this your
  device, right now._

Biometrics never reach the server; Firebase never sees a fingerprint. Authorization
(friend-of-friend visibility, "did you post today") is enforced in resolvers against Postgres, not
trusted from the client.

---

## 6. Security & privacy (Q9)

Cybersecurity and privacy are an explicit criterion, and privacy is also a **product feature** for
Dayli. Concrete measures, mapped to OWASP concerns:

- **AuthN/AuthZ** — Firebase-issued tokens verified server-side; per-resolver authorization checks;
  least-privilege Firebase Storage/security rules.
- **API security** — **GraphQL depth & complexity limiting** to prevent nested-query DoS (a
  GraphQL-specific risk); Zod input validation on every mutation; rate limiting on auth-adjacent
  endpoints.
- **Data protection** — **end-to-end encrypted DMs**: the server stores only ciphertext, keys never
  leave devices. Threat model: honest-but-curious server; a DB compromise does **not** reveal
  messages. (The 732 version sent messages in plaintext — naming and fixing that honestly is part of
  the story.)
- **Privacy as UX** — screenshot-detection notice (iOS; degrades gracefully on Android),
  private-only journal mode, explicit in-context permission prompts and off-switches for the
  sensitive sensors (location, ambient audio).
- **Secrets hygiene** — no secrets in git; `.env` git-ignored (already in repo `.gitignore`); private
  keys submitted via the course webapp, not committed.

---

## 7. Mobile-native capabilities (Q5)

Every feature below is chosen because **a browser cannot do it** — the "why native" argument the
course grades. Each is integrated for genuine user value, not as a checkbox.

| Capability | Flutter package | User value |
|---|---|---|
| Camera-first capture | `camera` | In-the-moment posting, not curated uploads |
| Location → weather context | `geolocator` + weather API | Silent context that later enriches the mood graph |
| Biometric app-lock | `local_auth` | Journal-grade privacy |
| Unlock / nudge push | `firebase_messaging` | Reaches users with no tab open — makes it a ritual |
| Scheduled recall ("on this day", future-self notes) | `flutter_local_notifications` | Re-engagement without a server round-trip |
| Charging-at-night recap | `battery_plus` | A calm moment when the user is winding down |
| Ambient clip / now-playing 🔵 | `record` / platform channels | Richer context — **hardest + most privacy-sensitive; could-have** |

---

## 8. Testing strategy (Q8)

Testing is treated as first-class, not end-loaded:

- **Unit** — Vitest per GraphQL resolver; Dart unit tests for logic (rating validation, date/midnight
  boundary).
- **Widget** — `flutter_test` for the composer and feed-gate states.
- **Integration** — `integration_test`/**Patrol** for the post → unlock → feed flow end to end.
- **Device** — manual matrix on iOS + Android for sensor/permission paths.
- CI runs unit + widget on every PR; integration on merge to `main`.

---

## 9. Deployment (Q11)

- **API** → Fly.io / Cloud Run · **Postgres** → Neon/Supabase · **Web** → Vercel · **Auth/FCM/
  Storage/Functions** → Firebase project.
- Deploys triggered from `main` via GitHub Actions. Assessors can install the app (TestFlight /
  APK), reach the deployed web app, and hit the live API.

---

## 10. Project management & workflow (Q10)

- **Branch-protected `main`** (PR + ≥1 review required) — feature-branch workflow, one branch per
  issue, conventional commits (`feat:`, `fix:`, `docs:`).
- **GitHub Projects + Issues** kanban; task breakdown per team member in the **Wiki**; **weekly
  minutes** in the Wiki (per the handout).
- Contributions spread across all four members and visible in history — regular, fine-grained commits.

---

## 11. Scope — MoSCoW (Q4, and the handout's "re-scope, don't extend" note)

The full vision is large for one semester and four people; we scope explicitly and will narrate any
cuts in the presentation.

- **Must:** Firebase Auth · GraphQL+Postgres core (post / feed-gate / friends) · FCM unlock push ·
  camera capture · weather context · biometric app-lock.
- **Should:** event-driven scheduler · encrypted DMs · mood graph · web reflection surface.
- **Could:** ambient audio · now-playing · assistant shortcuts · screenshot detection · future-self
  notes · charging recap.
- **Won't (this semester):** whiteboard/canvas · gamification · monetisation.

---

## 12. Assessment-criteria coverage map (Q12)

| # | Rubric question | Where addressed |
|---|---|---|
| 1 | Integrated mobile + web + cloud | §2, §3 |
| 2 | Mastery of Flutter + cloud tech | §3, §7 |
| 3 | Initiative / independent learning | §3 (codegen, E2E crypto, depth-limiting, fan-out) |
| 4 | Genuine user need + user stories | §1, §11 |
| 5 | Mobile-native capabilities | §4, §7 |
| 6 | Justified architecture (REST/GraphQL/WS/event-driven, scalability) | §2, §3, §4 |
| 7 | Software-engineering best practices | §3, §8, §10 |
| 8 | Testing strategy | §8 |
| 9 | Cybersecurity & privacy (OWASP) | §5, §6 |
| 10 | Project management & team practices | §10 |
| 11 | Deployment in a realistic environment | §2, §9 |
| 12 | Communication of design decisions | this document + Wiki |

---

_Open decisions (🔵): media store (Firebase Storage vs Cloudinary); realtime store for DMs (GraphQL
subscriptions vs Firestore); exact ambient-audio scope. Revisited as implementation proceeds._
