/**
 * Local demo dataset for Dayli: `pnpm db:dev:seed`.
 *
 * Creates ~150 synthetic personas with 400 days of history (posts, photos,
 * tomorrow notes, likes, comments, friendships, requests, and direct messages)
 * plus a demo account, May Gan (may@dayli.test / dayli-demo-2026).
 *
 * Safety: this writes synthetic data directly as the local `migrator` role and
 * refuses every target except migrator@localhost:5434/dayli_dev. Re-running it
 * first removes only previously seeded accounts (IDs starting with `seed_`).
 * Photos are written into the local media store (scripts/dev-media-server.mjs),
 * never to R2.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, linkSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createDatabase, schema, sql, type DayliDatabase } from "@dayli/db";
import { createAucklandDayService, type AucklandDay } from "@dayli/domain";
import { hashPassword } from "better-auth/crypto";
import postgres from "postgres";
import { DEMO_EMAIL, SEED_EMAIL_DOMAIN, SEED_ID_PREFIX, removePreviousSeed } from "./cleanup";
import {
  ARTISTS, DIALOGUES, FIRST_NAMES, JOBS, LAST_NAMES, MBTI_TYPES, MESSAGE_REQUEST_OPENERS, SONGS,
  makeAnswer, makeBio, makeCaption, makeComment, makeReply, makeTomorrowNote, makeWeather, usernameCandidates,
  type AnswerContext,
} from "./content";
import { pickPhotos, preparePhotoLibrary, type DemoPhoto } from "./photos";
import { Random, clamp } from "./random";

const DEMO_PASSWORD = "dayli-demo-2026";
const MEDIA_BUCKET = "dayli-media-local";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// ---------------------------------------------------------------------------
// Arguments and safety
// ---------------------------------------------------------------------------

interface Options {
  users: number;
  days: number;
  seed: number;
  photos: boolean;
  offline: boolean;
}

function parseOptions(argv: readonly string[]): Options {
  const options: Options = { users: 150, days: 400, seed: 734, photos: true, offline: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    const value = () => {
      const next = argv[index + 1];
      index += 1;
      const number = Number(next);
      if (!Number.isInteger(number) || number < 0) throw new Error(`${argument} needs a whole number.`);
      return number;
    };
    switch (argument) {
      case "--users": options.users = clamp(value(), 40, 2000); break;
      case "--days": options.days = clamp(value(), 30, 1500); break;
      case "--seed": options.seed = value(); break;
      case "--no-photos": options.photos = false; break;
      case "--offline": options.offline = true; break;
      case "--help":
      case "-h":
        console.log([
          "Usage: pnpm db:dev:seed [--users 150] [--days 400] [--seed 734] [--no-photos] [--offline]",
          "",
          "  --users      Generated personas, excluding May Gan (40-2000).",
          "  --days       Days of post history (30-1500).",
          "  --seed       PRNG seed; the same value reproduces the same content.",
          "  --no-photos  Skip post photos and avatars.",
          "  --offline    Don't download photos; use cached or generated images.",
        ].join("\n"));
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option ${argument}. Use --help.`);
    }
  }
  return options;
}

/** Mirrors the development migration guard: only the local dev database, only as migrator. */
function assertLocalTarget(databaseUrl: string | undefined): string {
  if (!databaseUrl) throw new Error("DATABASE_URL is required. Run this through `pnpm db:dev:seed`.");
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }
  const ok = process.env.MIGRATION_TARGET === "development"
    && parsed.protocol.startsWith("postgres")
    && parsed.username === "migrator"
    && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    && parsed.port === "5434"
    && parsed.pathname === "/dayli_dev";
  if (!ok) {
    throw new Error("Refusing to seed: the demo seed only targets migrator@localhost:5434/dayli_dev with MIGRATION_TARGET=development.");
  }
  return databaseUrl;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const seedUserId = () => `${SEED_ID_PREFIX}${randomBytes(12).toString("hex")}`;
const uuid = () => randomUUID();
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function addDays(localDate: string, delta: number): string {
  const [year, month, day] = localDate.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + delta)).toISOString().slice(0, 10);
}

function weekdayOf(localDate: string): number {
  const [year, month, day] = localDate.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay();
}

const earliest = (...dates: Date[]) => new Date(Math.min(...dates.map((date) => date.getTime())));
const latest = (...dates: Date[]) => new Date(Math.max(...dates.map((date) => date.getTime())));
const between = (random: Random, start: Date, end: Date) => new Date(start.getTime() + random.next() * Math.max(0, end.getTime() - start.getTime()));

async function insertChunked<T extends Record<string, unknown>>(
  db: { insert: DayliDatabase["insert"] },
  table: Parameters<DayliDatabase["insert"]>[0],
  rows: readonly T[],
): Promise<void> {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]!).length;
  const size = Math.max(1, Math.floor(30_000 / columns));
  for (let start = 0; start < rows.length; start += size) {
    // The rows are built to match each table's insert shape below.
    await db.insert(table).values(rows.slice(start, start + size) as never);
  }
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

interface Persona {
  id: string;
  name: string;
  first: string;
  username: string;
  email: string;
  displayUsername: string | null;
  bio: string | null;
  mbti: string | null;
  whatIDo: string | null;
  listeningTo: string | null;
  visibility: "public" | "private";
  createdAt: Date;
  createdLocalDate: string;
  home: string;
  cluster: number;
  secondCluster: number | null;
  postRate: number;
  moodBase: number;
  moodSwing: number;
  soloRate: number;
  photoRate: number;
  captionRate: number;
  weatherRate: number;
  noteRate: number;
  favouriteArtist: string;
  isMay: boolean;
  friends: Set<string>;
  hasAvatar: boolean;
}

interface PostRecord {
  id: string;
  authorId: string;
  localDate: string;
  daysAgo: number;
  rating: number;
  audience: "solo" | "friends";
  releasedAt: Date;
  hasPhotos: boolean;
}

const CLUSTER_HOMES: ReadonlyArray<readonly string[]> = [
  ["Auckland Central", "Mt Eden", "Grey Lynn", "Kingsland"],
  ["Ponsonby", "Grey Lynn", "Kingsland", "Parnell", "Devonport"],
  ["Mt Eden", "Newmarket", "Takapuna", "Mission Bay"],
  ["Auckland Central", "Parnell", "Newmarket", "Takapuna"],
  ["Hamilton", "Raglan", "Tauranga", "Mount Maunganui", "Rotorua"],
  ["Wellington", "Cuba Street", "Christchurch", "Dunedin", "Queenstown", "Nelson"],
];

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const databaseUrl = assertLocalTarget(process.env.DATABASE_URL);
  const stateDir = process.env.DAYLI_STATE_DIR || join(process.env.XDG_STATE_HOME || join(homedir(), ".local", "state"), "dayli");
  const mediaRoot = process.env.DAYLI_MEDIA_ROOT || join(stateDir, "media");
  const bucketRoot = join(mediaRoot, MEDIA_BUCKET);
  const photoCache = join(stateDir, "demo-photos");
  const random = new Random(options.seed);
  const started = Date.now();
  const log = (message: string) => console.log(`[seed] ${message}`);

  const client = postgres(databaseUrl, { max: 2, prepare: false, onnotice: () => {} });
  try {
    const now = new Date();
    const dayService = createAucklandDayService(() => now);
    const today = dayService.current();
    const dayCache = new Map<string, AucklandDay>();
    const dayFor = (localDate: string): AucklandDay => {
      let day = dayCache.get(localDate);
      if (!day) {
        const [year, month, date] = localDate.split("-").map(Number);
        // UTC midnight of a calendar date is midday that date in Auckland.
        day = dayService.forInstant(new Date(Date.UTC(year!, month! - 1, date!)));
        dayCache.set(localDate, day);
      }
      return day;
    };

    // --- Reference data ----------------------------------------------------
    const promptRows = await client<{ id: string; month_day: string; effective_date: string; text: string }[]>`
      select id, month_day, effective_date::text as effective_date, text from public.daily_prompts
    `;
    if (promptRows.length === 0) throw new Error("No daily prompts found. Run `pnpm db:dev:migrate` first.");
    const promptsByMonthDay = new Map<string, Array<(typeof promptRows)[number]>>();
    for (const row of promptRows) {
      const list = promptsByMonthDay.get(row.month_day) ?? [];
      list.push(row);
      promptsByMonthDay.set(row.month_day, list);
    }
    const promptFor = (localDate: string) => {
      const candidates = (promptsByMonthDay.get(localDate.slice(5)) ?? [])
        .filter((row) => row.effective_date <= localDate)
        .sort((left, right) => left.effective_date.localeCompare(right.effective_date));
      const prompt = candidates.at(-1);
      if (!prompt) throw new Error(`No daily prompt is effective on ${localDate}.`);
      return prompt;
    };
    const [currentTerms] = await client<{ id: string }[]>`
      select id from public.legal_document_versions
      where kind = 'terms' and status = 'effective' and effective_at <= now()
      order by effective_at desc, version desc limit 1
    `;

    // --- Remove the previous seed -------------------------------------------
    const cleanup = await removePreviousSeed(client, bucketRoot);
    if (cleanup.users > 0) log(`Removed ${cleanup.users} previously seeded accounts and their data.`);

    const taken = await client<{ username: string | null; email: string }[]>`select lower(username) as username, lower(email) as email from public."user"`;
    const takenUsernames = new Set(taken.map((row) => row.username).filter((value): value is string => value !== null));
    const takenEmails = new Set(taken.map((row) => row.email));
    if (takenEmails.has(DEMO_EMAIL)) {
      throw new Error(`${DEMO_EMAIL} already belongs to an account that wasn't created by this seed. Remove or rename it first.`);
    }

    // --- Photos ---------------------------------------------------------------
    let postPhotos: DemoPhoto[] = [];
    let avatarPhotos: DemoPhoto[] = [];
    if (options.photos) {
      const library = await preparePhotoLibrary(photoCache, { offline: options.offline, log });
      postPhotos = library.posts;
      avatarPhotos = library.avatars;
      log(`Photo library ready: ${postPhotos.length} post photos, ${avatarPhotos.length} avatars (${library.downloaded} downloaded now, ${library.generated} generated).`);
    }

    // --- Personas -------------------------------------------------------------
    const claimUsername = (candidates: readonly string[]) => {
      for (const candidate of candidates) {
        if (!takenUsernames.has(candidate)) {
          takenUsernames.add(candidate);
          return candidate;
        }
      }
      for (let suffix = 1; ; suffix += 1) {
        const candidate = `${candidates[0]!.slice(0, 26)}_${suffix}`;
        if (!takenUsernames.has(candidate)) {
          takenUsernames.add(candidate);
          return candidate;
        }
      }
    };

    const windowStart = today.startUtc.getTime() - options.days * DAY;
    const may: Persona = {
      id: seedUserId(),
      name: "May Gan",
      first: "May",
      username: claimUsername(["maygan", "may_gan", "maygan_", "may_gan_nz"]),
      email: DEMO_EMAIL,
      displayUsername: "May Gan",
      bio: "Auckland · CS @ UoA · collecting small good moments ☕️📷",
      mbti: "ENFP",
      whatIDo: "Computer Science @ UoA",
      listeningTo: "Laufey · From The Start",
      visibility: "public",
      createdAt: new Date(windowStart - 21 * DAY),
      createdLocalDate: "",
      home: "Auckland Central",
      cluster: 0,
      secondCluster: 1,
      postRate: 0.88,
      moodBase: 7,
      moodSwing: 1.4,
      soloRate: 0.12,
      photoRate: 0.45,
      captionRate: 0.5,
      weatherRate: 0.7,
      noteRate: 0.3,
      favouriteArtist: "Laufey",
      isMay: true,
      friends: new Set(),
      hasAvatar: avatarPhotos.length > 0,
    };
    may.createdLocalDate = dayService.forInstant(may.createdAt).localDate;

    const personas: Persona[] = [];
    for (let index = 0; index < options.users; index += 1) {
      const first = random.pick(FIRST_NAMES);
      const last = random.pick(LAST_NAMES);
      const cluster = index % CLUSTER_HOMES.length;
      const recentJoiner = random.chance(0.12);
      const createdAt = new Date(recentJoiner
        ? today.startUtc.getTime() - random.int(20, Math.max(25, Math.floor(options.days * 0.7))) * DAY
        : windowStart - random.int(1, 120) * DAY);
      const home = random.pick(CLUSTER_HOMES[cluster]!);
      const job = random.pick(JOBS);
      const username = claimUsername(usernameCandidates(random, first, last));
      const withName = random.chance(0.8);
      const persona: Persona = {
        id: seedUserId(),
        name: `${first} ${last}`,
        first,
        username,
        email: `${username}@${SEED_EMAIL_DOMAIN}`,
        displayUsername: withName ? `${first} ${last}`.slice(0, 80) : null,
        bio: random.chance(0.85) ? makeBio(random, home, job) : null,
        mbti: random.chance(0.55) ? random.pick(MBTI_TYPES) : null,
        whatIDo: random.chance(0.75) ? job : null,
        listeningTo: random.chance(0.6) ? `${random.pick(ARTISTS)} · ${random.pick(SONGS)}`.slice(0, 100) : null,
        visibility: random.chance(0.85) ? "public" : "private",
        createdAt,
        createdLocalDate: dayService.forInstant(createdAt).localDate,
        home,
        cluster,
        secondCluster: random.chance(0.4) ? random.int(0, CLUSTER_HOMES.length - 1) : null,
        postRate: random.float(0.25, 0.95),
        moodBase: random.float(4.8, 8.2),
        moodSwing: random.float(0.8, 2.2),
        soloRate: random.float(0.03, 0.35),
        photoRate: random.float(0.12, 0.6),
        captionRate: random.float(0.15, 0.6),
        weatherRate: random.float(0.3, 0.85),
        noteRate: random.float(0.05, 0.3),
        favouriteArtist: random.pick(ARTISTS),
        isMay: false,
        friends: new Set(),
        hasAvatar: avatarPhotos.length > 0 && random.chance(0.7),
      };
      personas.push(persona);
    }
    const everyone = [may, ...personas];
    const byId = new Map(everyone.map((persona) => [persona.id, persona]));

    // --- Relationships --------------------------------------------------------
    const friendshipRows: Array<typeof schema.friendships.$inferInsert> = [];
    const requestRows: Array<typeof schema.friendRequests.$inferInsert> = [];
    const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const connected = new Set<string>();

    const addFriendship = (a: Persona, b: Persona, state: "active" | "ended", earlyBias = false) => {
      connected.add(pairKey(a.id, b.id));
      const earliestStart = new Date(Math.max(a.createdAt.getTime(), b.createdAt.getTime()) + DAY);
      const latestStart = new Date(now.getTime() - 3 * DAY);
      const start = earlyBias
        ? between(random, earliestStart, earliest(latestStart, new Date(earliestStart.getTime() + 60 * DAY)))
        : between(random, earliestStart, latestStart);
      const [sender, recipient] = random.chance(0.5) ? [a, b] : [b, a];
      requestRows.push({
        id: uuid(),
        senderId: sender.id,
        recipientId: recipient.id,
        status: "accepted",
        createdAt: latest(earliestStart, new Date(start.getTime() - random.int(1, 72) * HOUR)),
        resolvedAt: start,
      });
      const stateChangedAt = state === "active" ? start : between(random, new Date(start.getTime() + 7 * DAY), new Date(now.getTime() - DAY));
      friendshipRows.push(
        { userId: a.id, friendId: b.id, state, stateChangedAt },
        { userId: b.id, friendId: a.id, state, stateChangedAt },
      );
      if (state === "active") {
        a.friends.add(b.id);
        b.friends.add(a.id);
      }
    };

    for (let i = 0; i < personas.length; i += 1) {
      for (let j = i + 1; j < personas.length; j += 1) {
        const a = personas[i]!;
        const b = personas[j]!;
        if (a.friends.size >= 40 || b.friends.size >= 40) continue;
        const probability = a.cluster === b.cluster ? 0.34
          : a.secondCluster === b.cluster || b.secondCluster === a.cluster ? 0.12
            : 0.015;
        if (random.chance(probability)) addFriendship(a, b, "active");
        else if (random.chance(0.004)) addFriendship(a, b, "ended");
      }
    }
    for (const persona of personas) {
      while (persona.friends.size < 6) {
        const candidate = random.pick(personas.filter((other) => other.cluster === persona.cluster));
        if (candidate.id === persona.id || connected.has(pairKey(persona.id, candidate.id))) {
          const any = random.pick(personas);
          if (any.id !== persona.id && !connected.has(pairKey(persona.id, any.id))) addFriendship(persona, any, "active");
          continue;
        }
        addFriendship(persona, candidate, "active");
      }
    }

    // May: 30 friends, mostly uni and Auckland circles.
    const mayFriends = [
      ...random.sample(personas.filter((p) => p.cluster === 0), 14),
      ...random.sample(personas.filter((p) => p.cluster === 1), 8),
    ];
    const mayFriendIds = new Set(mayFriends.map((p) => p.id));
    mayFriends.push(...random.sample(personas.filter((p) => !mayFriendIds.has(p.id) && p.cluster >= 2), 8));
    for (const friend of mayFriends) addFriendship(may, friend, "active", true);
    const mayConnected = (persona: Persona) => connected.has(pairKey(may.id, persona.id));
    const strangers = personas.filter((persona) => !mayConnected(persona));
    const mutualCount = (persona: Persona) => [...persona.friends].filter((id) => may.friends.has(id)).length;
    const byMutuals = [...strangers].sort((left, right) => mutualCount(right) - mutualCount(left));

    const oldFriend = byMutuals.find((persona) => persona.cluster === 4) ?? byMutuals[byMutuals.length - 1]!;
    addFriendship(may, oldFriend, "ended");
    const incoming = byMutuals.filter((persona) => !mayConnected(persona)).slice(0, 5);
    const outgoingPool = byMutuals.filter((persona) => !mayConnected(persona) && !incoming.includes(persona) && persona.visibility === "public");
    const outgoing = random.sample(outgoingPool.slice(0, 40), 3);
    for (const sender of incoming) {
      connected.add(pairKey(may.id, sender.id));
      requestRows.push({ id: uuid(), senderId: sender.id, recipientId: may.id, status: "pending", createdAt: new Date(now.getTime() - random.int(1, 9 * 24) * HOUR), resolvedAt: null });
    }
    for (const recipient of outgoing) {
      connected.add(pairKey(may.id, recipient.id));
      requestRows.push({ id: uuid(), senderId: may.id, recipientId: recipient.id, status: "pending", createdAt: new Date(now.getTime() - random.int(2, 14 * 24) * HOUR), resolvedAt: null });
    }
    const messageRequesters = random.sample(personas.filter((persona) => !mayConnected(persona) && persona.visibility === "public"), 2);

    // Persona-to-persona pending and declined requests.
    let pendingAdded = 0;
    let declinedAdded = 0;
    for (let attempt = 0; attempt < 2000 && (pendingAdded < 25 || declinedAdded < 15); attempt += 1) {
      const a = random.pick(personas);
      const b = random.pick(personas);
      if (a.id === b.id || connected.has(pairKey(a.id, b.id))) continue;
      connected.add(pairKey(a.id, b.id));
      if (pendingAdded < 25) {
        pendingAdded += 1;
        requestRows.push({ id: uuid(), senderId: a.id, recipientId: b.id, status: "pending", createdAt: new Date(now.getTime() - random.int(1, 20 * 24) * HOUR), resolvedAt: null });
      } else {
        declinedAdded += 1;
        const createdAt = new Date(now.getTime() - random.int(20, 200) * DAY);
        requestRows.push({ id: uuid(), senderId: a.id, recipientId: b.id, status: "declined", createdAt, resolvedAt: new Date(createdAt.getTime() + random.int(1, 72) * HOUR) });
      }
    }

    // --- Users, credentials, legal records, avatars --------------------------
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    const userRows: Array<typeof schema.user.$inferInsert> = everyone.map((persona) => ({
      id: persona.id,
      name: persona.name,
      username: persona.username,
      displayUsername: persona.displayUsername,
      bio: persona.bio,
      mbti: persona.mbti,
      whatIDo: persona.whatIDo,
      listeningTo: persona.listeningTo,
      profileVisibility: persona.visibility,
      email: persona.email,
      emailVerified: true,
      image: null,
      createdAt: persona.createdAt,
      updatedAt: persona.createdAt,
      tier: "free" as const,
    }));
    const accountRows: Array<typeof schema.account.$inferInsert> = everyone.map((persona) => ({
      id: uuid().replaceAll("-", ""),
      accountId: persona.id,
      providerId: "credential",
      userId: persona.id,
      password: passwordHash,
      createdAt: persona.createdAt,
      updatedAt: persona.createdAt,
    }));
    const ageRows: Array<typeof schema.ageDeclarations.$inferInsert> = everyone.map((persona) => ({
      userId: persona.id,
      declarationVersion: "age-16-v1",
      declaredAt: persona.createdAt,
    }));
    const termsRows: Array<typeof schema.termsAcceptances.$inferInsert> = currentTerms
      ? everyone.map((persona) => ({ userId: persona.id, termsVersionId: currentTerms.id, acceptedAt: latest(persona.createdAt, new Date(now.getTime() - DAY)) }))
      : [];

    const reservationRows: Array<typeof schema.mediaReservation.$inferInsert> = [];
    const avatarRows: Array<typeof schema.profileAvatars.$inferInsert> = [];
    const objectLinks: Array<{ ownerId: string; reservationId: string; photo: DemoPhoto }> = [];
    const reserve = (ownerId: string, photo: DemoPhoto, at: Date) => {
      const reservationId = uuid();
      reservationRows.push({
        id: reservationId,
        ownerId,
        objectKey: `media/${ownerId}/${reservationId}`,
        contentType: photo.contentType,
        byteSize: photo.byteSize,
        status: "validated",
        validatedAt: new Date(at.getTime() - MINUTE),
        createdAt: new Date(at.getTime() - 3 * MINUTE),
        expiresAt: new Date(at.getTime() + HOUR),
      });
      objectLinks.push({ ownerId, reservationId, photo });
      return reservationId;
    };
    for (const persona of everyone) {
      if (!persona.hasAvatar) continue;
      const setAt = new Date(persona.createdAt.getTime() + random.int(1, 48) * HOUR);
      const reservationId = reserve(persona.id, random.pick(avatarPhotos), setAt);
      avatarRows.push({ userId: persona.id, reservationId, setAt });
    }

    // --- Posts ----------------------------------------------------------------
    const postRows: Array<typeof schema.posts.$inferInsert> = [];
    const postMediaRows: Array<typeof schema.postMedia.$inferInsert> = [];
    const noteRows: Array<typeof schema.tomorrowNotes.$inferInsert> = [];
    const posts: PostRecord[] = [];
    const mayFriendSet = may.friends;

    for (const persona of everyone) {
      const friendNames = [...persona.friends].map((id) => byId.get(id)!.first);
      for (let daysAgo = 0; daysAgo < options.days; daysAgo += 1) {
        const localDate = addDays(today.localDate, -daysAgo);
        if (localDate <= persona.createdLocalDate) continue;
        let postsThatDay: boolean;
        if (persona.isMay) {
          // A streak ending yesterday, an On This Day post, and today left open for the demo.
          postsThatDay = daysAgo === 0 ? false
            : daysAgo <= 23 ? true
              : daysAgo === 24 ? false
                : daysAgo === 365 || daysAgo === 730 ? true
                  : random.chance(persona.postRate);
        } else if (daysAgo === 0) {
          postsThatDay = random.chance(persona.postRate * 0.45);
        } else if (daysAgo === 1 && mayFriendSet.has(persona.id)) {
          postsThatDay = random.chance(Math.max(persona.postRate, 0.85));
        } else {
          postsThatDay = random.chance(persona.postRate);
        }
        if (!postsThatDay) continue;

        const day = dayFor(localDate);
        const weekday = weekdayOf(localDate);
        const monthIndex = Number(localDate.slice(5, 7)) - 1;
        const seasonal = Math.cos(((monthIndex - 0.5) / 12) * 2 * Math.PI) * 0.5;
        const weekend = weekday === 0 || weekday === 6 ? 0.5 : 0;
        const rating = Math.round(clamp(persona.moodBase + seasonal + weekend + random.normal() * persona.moodSwing, 1, 10));
        const prompt = promptFor(localDate);
        const windowOpen = new Date(day.startUtc.getTime() + 7 * HOUR);
        const windowClose = daysAgo === 0 ? new Date(now.getTime() - 2 * MINUTE) : new Date(day.nextMidnightUtc.getTime() - 3 * MINUTE);
        if (windowClose <= windowOpen) continue;
        const acceptedAt = between(random, windowOpen, windowClose);
        const context: AnswerContext = {
          promptText: prompt.text,
          rating,
          friendNames,
          favouriteArtist: persona.favouriteArtist,
          home: persona.home,
          weekday,
          monthIndex,
        };
        const weather = random.chance(persona.weatherRate) ? makeWeather(random, monthIndex, persona.home) : null;
        const audience: "solo" | "friends" = random.chance(persona.soloRate) ? "solo" : "friends";
        const id = uuid();
        postRows.push({
          id,
          authorId: persona.id,
          localDate,
          promptId: prompt.id,
          reflectiveAnswer: makeAnswer(random, context),
          caption: random.chance(persona.captionRate) ? makeCaption(random, context) : null,
          rating,
          audience,
          weatherCondition: weather?.condition ?? null,
          weatherTemperatureC: weather?.temperatureC ?? null,
          weatherPlaceName: weather?.placeName ?? null,
          acceptedAt,
          releasedAt: day.nextMidnightUtc,
          createdAt: acceptedAt,
          updatedAt: acceptedAt,
        });

        let hasPhotos = false;
        if (postPhotos.length > 0 && (persona.isMay || daysAgo <= 180) && random.chance(persona.photoRate)) {
          const count = random.weighted<number>([[1, 0.6], [2, 0.28], [3, 0.12]]);
          pickPhotos(random, postPhotos, count).forEach((photo, order) => {
            postMediaRows.push({ id: uuid(), postId: id, attachmentOrder: order, reservationId: reserve(persona.id, photo, acceptedAt), acceptedAt });
          });
          hasPhotos = true;
        }
        if (random.chance(persona.noteRate)) {
          noteRows.push({ id: uuid(), postId: id, authorId: persona.id, note: makeTomorrowNote(random, context), submittedAt: acceptedAt, availableOn: addDays(localDate, 1) });
        }
        posts.push({ id, authorId: persona.id, localDate, daysAgo, rating, audience, releasedAt: day.nextMidnightUtc, hasPhotos });
      }
    }

    // --- Likes and comments ---------------------------------------------------
    const likeRows: Array<typeof schema.postLikes.$inferInsert> = [];
    const commentRows: Array<typeof schema.postComments.$inferInsert> = [];
    const replyRows: Array<typeof schema.postComments.$inferInsert> = [];
    const reactionTime = (released: Date, maxHours: number) => earliest(
      new Date(released.getTime() + random.int(5, maxHours * 60) * MINUTE),
      new Date(now.getTime() - MINUTE),
    );
    for (const post of posts) {
      if (post.audience !== "friends" || post.releasedAt > now) continue;
      const author = byId.get(post.authorId)!;
      const recency = post.daysAgo <= 30 ? 1.3 : post.daysAgo <= 180 ? 1 : 0.55;
      for (const friendId of author.friends) {
        const friendIsMay = friendId === may.id;
        if (friendIsMay && post.daysAgo > 120) continue;
        const probability = (author.isMay ? 0.42 : friendIsMay ? 0.3 : 0.1) * recency;
        if (random.chance(probability)) likeRows.push({ postId: post.id, userId: friendId, createdAt: reactionTime(post.releasedAt, 36) });
      }
      const commentChance = (author.isMay ? 0.55 : 0.16) * recency;
      if (author.friends.size > 0 && random.chance(commentChance)) {
        const commenters = random.sample([...author.friends], random.weighted<number>([[1, 0.6], [2, 0.3], [3, 0.1]]));
        for (const commenterId of commenters) {
          if (commenterId === may.id && post.daysAgo > 90) continue;
          const commentId = uuid();
          const createdAt = reactionTime(post.releasedAt, 30);
          commentRows.push({ id: commentId, postId: post.id, authorId: commenterId, parentCommentId: null, clientCommentId: uuid(), body: makeComment(random, post.rating, post.hasPhotos), createdAt });
          if (random.chance(0.45)) {
            replyRows.push({
              id: uuid(), postId: post.id, authorId: author.id, parentCommentId: commentId, clientCommentId: uuid(), body: makeReply(random),
              createdAt: earliest(new Date(createdAt.getTime() + random.int(3, 240) * MINUTE), new Date(now.getTime() - 30_000)),
            });
          }
        }
      }
    }

    // --- Direct messages --------------------------------------------------------
    const conversationRows: Array<typeof schema.conversations.$inferInsert> = [];
    const memberRows: Array<typeof schema.conversationMembers.$inferInsert> = [];
    const messageRows: Array<typeof schema.messages.$inferInsert> = [];
    const messageReactionRows: Array<typeof schema.messageReactions.$inferInsert> = [];
    const changeRows: Array<typeof schema.conversationChanges.$inferInsert> = [];
    const REACTIONS = [["love", 4], ["laugh", 4], ["like", 3], ["thanks", 1], ["surprised", 1], ["sad", 0.5], ["angry", 0.2]] as const;
    const FOLLOW_UPS = ["also are you free thursday?", "lmk!", "???", "omg wait I just saw your post", "call me when you can", "sending the photos now"];

    const buildConversation = (input: {
      a: Persona;
      b: Persona;
      initiator: Persona;
      firstAt: Date;
      lastAt: Date;
      count: number;
      requestState: "active" | "pending";
      unreadFor?: { reader: Persona; count: number };
      lines?: ReadonlyArray<readonly [Persona, string]>;
    }) => {
      const conversationId = uuid();
      const [low, high] = input.a.id < input.b.id ? [input.a, input.b] : [input.b, input.a];
      const planned: Array<{ sender: Persona; body: string }> = [];
      if (input.lines) {
        for (const [sender, body] of input.lines) planned.push({ sender, body });
      } else {
        while (planned.length < input.count) {
          const dialogue = random.pick(DIALOGUES);
          const opener = planned.length === 0 ? input.initiator : random.chance(0.5) ? input.a : input.b;
          const other = opener.id === input.a.id ? input.b : input.a;
          for (const [speaker, body] of dialogue) planned.push({ sender: speaker === 0 ? opener : other, body });
        }
        planned.length = input.count;
        if (input.unreadFor) {
          const sender = input.unreadFor.reader.id === input.a.id ? input.b : input.a;
          for (let index = 0; index < input.unreadFor.count; index += 1) planned.push({ sender, body: random.pick(FOLLOW_UPS) });
        }
      }

      // Spread messages over the timeline in bursts, keeping order.
      const total = planned.length;
      const span = Math.max(input.lastAt.getTime() - input.firstAt.getTime(), MINUTE);
      const anchors = Array.from({ length: total }, () => random.next()).sort((left, right) => left - right);
      let previous = input.firstAt.getTime();
      const times = anchors.map((anchor, index) => {
        const target = index === total - 1 ? input.lastAt.getTime() : input.firstAt.getTime() + Math.pow(anchor, 0.7) * span;
        const at = Math.max(target, previous + random.int(15, 240) * 1000);
        previous = at;
        return new Date(Math.min(at, now.getTime() - 30_000));
      });

      const events: Array<{ at: Date; kind: string; messageId: string; memberId: string | null }> = [];
      planned.forEach((message, index) => {
        const id = uuid();
        const createdAt = times[index]!;
        const unsent = total > 6 && index < total - 3 && random.chance(0.01);
        const edited = !unsent && random.chance(0.02);
        messageRows.push({
          id,
          conversationId,
          sequence: index + 1,
          senderId: message.sender.id,
          senderParticipantId: message.sender.id,
          clientMessageId: uuid(),
          requestFingerprint: sha256(`${conversationId}:${index}:${message.body}`),
          body: unsent ? null : message.body,
          version: edited || unsent ? 2 : 1,
          createdAt,
          editedAt: edited ? new Date(createdAt.getTime() + random.int(20, 300) * 1000) : null,
          unsentAt: unsent ? new Date(createdAt.getTime() + random.int(5, 60) * 1000) : null,
        });
        events.push({ at: createdAt, kind: "message.created", messageId: id, memberId: null });
        if (edited) events.push({ at: new Date(createdAt.getTime() + 60_000), kind: "message.edited", messageId: id, memberId: message.sender.id });
        if (unsent) events.push({ at: new Date(createdAt.getTime() + 30_000), kind: "message.unsent", messageId: id, memberId: message.sender.id });
        if (!unsent && input.requestState === "active" && random.chance(0.12)) {
          const reactor = message.sender.id === input.a.id ? input.b : input.a;
          const reactedAt = earliest(new Date(createdAt.getTime() + random.int(10, 7200) * 1000), new Date(now.getTime() - 10_000));
          messageReactionRows.push({ messageId: id, userId: reactor.id, participantId: reactor.id, reaction: random.weighted(REACTIONS), createdAt: reactedAt });
          events.push({ at: reactedAt, kind: "reaction.changed", messageId: id, memberId: reactor.id });
        }
      });
      events.sort((left, right) => left.at.getTime() - right.at.getTime());
      events.forEach((event, index) => {
        changeRows.push({
          conversationId,
          changeSequence: index + 1,
          kind: event.kind,
          messageId: event.messageId,
          memberId: event.memberId,
          memberParticipantId: event.memberId,
          createdAt: event.at,
        });
      });

      const firstAt = times[0]!;
      const lastAt = times[total - 1]!;
      conversationRows.push({
        id: conversationId,
        kind: "direct",
        userLowId: low.id,
        userHighId: high.id,
        initiatorId: input.initiator.id,
        participantLowId: low.id,
        participantHighId: high.id,
        initiatorParticipantId: input.initiator.id,
        requestState: input.requestState,
        lastMessageSequence: total,
        lastChangeSequence: events.length,
        lastActivityAt: lastAt,
        createdAt: firstAt,
        updatedAt: lastAt,
      });
      for (const member of [input.a, input.b]) {
        let lastRead = total;
        if (input.unreadFor?.reader.id === member.id) lastRead = total - input.unreadFor.count;
        if (input.requestState === "pending" && member.id !== input.initiator.id) lastRead = 0;
        memberRows.push({
          conversationId,
          userId: member.id,
          participantId: member.id,
          lastReadSequence: lastRead,
          receiptSequence: lastRead,
          createdAt: firstAt,
          updatedAt: lastAt,
        });
      }
    };

    const friendshipStart = (a: Persona, b: Persona) => {
      const row = requestRows.find((request) => request.status === "accepted"
        && ((request.senderId === a.id && request.recipientId === b.id) || (request.senderId === b.id && request.recipientId === a.id)));
      return row?.resolvedAt ?? new Date(Math.max(a.createdAt.getTime(), b.createdAt.getTime()) + DAY);
    };

    const mayChats = [...mayFriends].sort((left, right) => left.cluster - right.cluster).slice(0, 12);
    const lastAgo = [5 * MINUTE, 40 * MINUTE, 3 * HOUR, 9 * HOUR, DAY, 2 * DAY, 3 * DAY, 5 * DAY, 8 * DAY, 13 * DAY, 21 * DAY, 34 * DAY];
    const unreadCounts = [2, 1, 3, 1];
    random.shuffle(mayChats).forEach((friend, index) => {
      const start = friendshipStart(may, friend);
      const lastAt = new Date(now.getTime() - lastAgo[index]!);
      const firstAt = latest(new Date(start.getTime() + HOUR), new Date(lastAt.getTime() - random.int(20, 300) * DAY));
      const unread = unreadCounts[index];
      buildConversation({
        a: may,
        b: friend,
        initiator: random.chance(0.5) ? may : friend,
        firstAt: earliest(firstAt, new Date(lastAt.getTime() - HOUR)),
        lastAt,
        count: random.int(12, 90),
        requestState: "active",
        ...(unread ? { unreadFor: { reader: may, count: unread } } : {}),
      });
    });
    messageRequesters.forEach((requester, index) => {
      const sentAt = new Date(now.getTime() - (index === 0 ? 4 * HOUR : 2 * DAY));
      const opener = MESSAGE_REQUEST_OPENERS[index % MESSAGE_REQUEST_OPENERS.length]!;
      const lines: Array<readonly [Persona, string]> = [[requester, opener]];
      if (index === 0) lines.push([requester, "no worries if not, just wanted to say hi!"]);
      buildConversation({ a: requester, b: may, initiator: requester, firstAt: sentAt, lastAt: new Date(sentAt.getTime() + 2 * MINUTE), count: lines.length, requestState: "pending", lines });
    });
    const personaPairs = new Set<string>();
    for (let attempt = 0; attempt < 5000 && personaPairs.size < Math.round(options.users); attempt += 1) {
      const a = random.pick(personas);
      if (a.friends.size === 0) continue;
      const b = byId.get(random.pick([...a.friends]))!;
      if (b.isMay || personaPairs.has(pairKey(a.id, b.id))) continue;
      personaPairs.add(pairKey(a.id, b.id));
      const lastAt = new Date(now.getTime() - random.int(10, 60 * 24 * 60) * MINUTE);
      const start = friendshipStart(a, b);
      const firstAt = earliest(latest(new Date(start.getTime() + HOUR), new Date(lastAt.getTime() - random.int(5, 200) * DAY)), new Date(lastAt.getTime() - HOUR));
      buildConversation({ a, b, initiator: a, firstAt, lastAt, count: random.int(6, 40), requestState: "active" });
    }

    // --- Write ------------------------------------------------------------------
    log(`Writing ${everyone.length} accounts, ${postRows.length} posts, ${likeRows.length} likes, ${commentRows.length + replyRows.length} comments, ${messageRows.length} messages…`);
    await createDatabase(client).transaction(async (tx) => {
      await tx.execute(sql`set local statement_timeout = '15min'`);
      await insertChunked(tx, schema.user, userRows);
      await insertChunked(tx, schema.account, accountRows);
      await insertChunked(tx, schema.ageDeclarations, ageRows);
      await insertChunked(tx, schema.termsAcceptances, termsRows);
      await insertChunked(tx, schema.mediaReservation, reservationRows);
      await insertChunked(tx, schema.profileAvatars, avatarRows);
      await insertChunked(tx, schema.friendRequests, requestRows);
      await insertChunked(tx, schema.friendships, friendshipRows);
      await insertChunked(tx, schema.posts, postRows);
      await insertChunked(tx, schema.postMedia, postMediaRows);
      await insertChunked(tx, schema.tomorrowNotes, noteRows);
      await insertChunked(tx, schema.postLikes, likeRows);
      await insertChunked(tx, schema.postComments, commentRows);
      await insertChunked(tx, schema.postComments, replyRows);
      await insertChunked(tx, schema.conversations, conversationRows);
      await insertChunked(tx, schema.conversationMembers, memberRows);
      await insertChunked(tx, schema.messages, messageRows);
      await insertChunked(tx, schema.messageReactions, messageReactionRows);
      await insertChunked(tx, schema.conversationChanges, changeRows);
    });

    // --- Media objects ----------------------------------------------------------
    // Hardlinks keep thousands of attachments to a few megabytes on disk.
    for (const link of objectLinks) {
      const directory = join(bucketRoot, "media", link.ownerId);
      mkdirSync(directory, { recursive: true });
      const target = join(directory, link.reservationId);
      if (existsSync(target)) continue;
      try {
        linkSync(link.photo.path, target);
      } catch {
        copyFileSync(link.photo.path, target);
      }
    }

    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const mayPosts = posts.filter((post) => post.authorId === may.id).length;
    const feedCount = posts.filter((post) => post.daysAgo === 1 && post.audience === "friends" && may.friends.has(post.authorId)).length;
    console.log([
      "",
      `Seeded the local database in ${seconds}s.`,
      `  Accounts:       ${everyone.length} (${personas.length} personas + May Gan)`,
      `  Posts:          ${postRows.length} (${postMediaRows.length} photos, ${noteRows.length} tomorrow notes)`,
      `  Interactions:   ${likeRows.length} likes, ${commentRows.length + replyRows.length} comments`,
      `  Friendships:    ${friendshipRows.length / 2} (${requestRows.filter((row) => row.status === "pending").length} pending requests)`,
      `  Conversations:  ${conversationRows.length} (${messageRows.length} messages)`,
      `  Media objects:  ${objectLinks.length} in ${bucketRoot}`,
      "",
      "Demo account",
      `  Email:     ${DEMO_EMAIL}`,
      `  Password:  ${DEMO_PASSWORD}`,
      `  Username:  @${may.username}`,
      `  ${may.friends.size} friends, ${incoming.length} incoming + ${outgoing.length} outgoing requests, ${mayChats.length} chats + ${messageRequesters.length} message requests`,
      `  ${mayPosts} posts of her own; today's feed shows ${feedCount} friends' posts from yesterday.`,
      "",
      `Every persona uses the same password. Example: ${mayFriends[0]!.email}`,
      "The feed shows yesterday's posts, so re-run `pnpm db:dev:seed` on a later day to refresh it.",
    ].join("\n"));
  } finally {
    await client.end({ timeout: 5 });
  }
}

function formatSeedError(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    if (code === "ECONNREFUSED") {
      return "Could not connect to localhost:5434/dayli_dev (ECONNREFUSED). Start the local database first with `pnpm db:dev:up`.";
    }
    if (error.message.trim().length > 0) {
      return error.message;
    }
    if ("errors" in error && Array.isArray((error as { errors?: unknown }).errors)) {
      const inner = (error as { errors: unknown[] }).errors
        .map((item) => (item instanceof Error && item.message ? item.message : String(item)))
        .filter((text) => text.trim().length > 0);
      if (inner.length > 0) return inner.join("; ");
    }
    if (typeof code === "string" && code.length > 0) {
      return `${error.name}: ${code}`;
    }
    return error.name || "Unknown error";
  }
  return String(error);
}

main().catch((error: unknown) => {
  console.error(`[seed] ${formatSeedError(error)}`);
  process.exitCode = 1;
});
