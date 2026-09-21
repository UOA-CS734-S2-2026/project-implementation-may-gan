import { sql } from "drizzle-orm";
import {
  check,
  date,
  integer,
  pgTable,
  text,
  unique,
} from "drizzle-orm/pg-core";
import type { DayliDatabase } from "../index";

/**
 * This catalog is reference data, not user content.
 *
 * The version-one text is copied from
 * 732-workspace/group-project-wdcc/lib/db/seed/dailyPrompts/seed.ts at the
 * agreed source commit. Prompt rows are insert-only: a changed prompt must
 * receive a new ID and version with a later Auckland effective date.
 */
export const DAILY_PROMPT_SOURCE = "732-workspace/group-project-wdcc";
export const DAILY_PROMPT_SOURCE_COMMIT = "7d2dfd6";
export const DAILY_PROMPT_VERSION_1 = 1;
export const DAILY_PROMPT_VERSION_1_EFFECTIVE_DATE = "1970-01-01";
export const DAILY_PROMPT_TEXT_MAX_CODE_POINTS = 4_000;
export const DAILY_PROMPT_MONTH_LENGTHS = [
  31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
] as const;

export interface DailyPromptSeed {
  id: string;
  monthDay: string;
  text: string;
  version: number;
  effectiveDate: string;
  source: string;
  sourceCommit: string;
}

export const dailyPrompts = pgTable(
  "daily_prompts",
  {
    id: text("id").primaryKey(),
    monthDay: text("month_day").notNull(),
    text: text("text").notNull(),
    version: integer("version").notNull(),
    effectiveDate: date("effective_date", { mode: "string" }).notNull(),
    source: text("source").notNull(),
    sourceCommit: text("source_commit").notNull(),
  },
  (table) => [
    unique("daily_prompts_month_day_version_unique").on(table.monthDay, table.version),
    unique("daily_prompts_month_day_effective_date_unique").on(table.monthDay, table.effectiveDate),
    check(
      "daily_prompts_id_format_check",
      sql`${table.id} ~ '^prompt-[0-9]{2}-[0-9]{2}(-v[0-9]+)?$'`,
    ),
    check(
      "daily_prompts_month_day_format_check",
      sql`${table.monthDay} ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'`,
    ),
    check("daily_prompts_version_positive_check", sql`${table.version} > 0`),
    check(
      "daily_prompts_text_length_check",
      sql`char_length(${table.text}) between 1 and 4000`,
    ),
  ],
);

export type DailyPrompt = typeof dailyPrompts.$inferSelect;
export type DailyPromptInsert = typeof dailyPrompts.$inferInsert;

const LEGACY_PROMPT_TEXTS: string[] = [
  "What's something you want to achieve this year?",
  "What was your favourite meal of the day?",
  "When did you wake up today?",
  "What made you smile today?",
  "What's one thing you're looking forward to this week?",
  "Describe your evening in three words.",
  "Who did you spend time with today?",
  "What song has been stuck in your head?",
  "What's the last thing you Googled?",
  "What's something small that brought you joy today?",
  "What's a goal you're working towards right now?",
  "What was the best part of today?",
  "What's one thing you learned today?",
  "How are you feeling right now?",
  "What did you eat for breakfast?",
  "What's something you're grateful for today?",
  "Describe today in one sentence.",
  "What's on your mind tonight?",
  "What was the most interesting conversation you had today?",
  "What book or show have you been into lately?",
  "What's something you wish you'd done differently today?",
  "What's a small win from today?",
  "What did your morning look like?",
  "What's one thing you want to remember about today?",
  "What's been your favourite moment of the week?",
  "Who reached out to you today?",
  "What's something you enjoyed today that you think is underrated?",
  "What's the most beautiful thing you saw today?",
  "What's something you're proud of this week?",
  "What was the weather like today?",
  "What's been on repeat in your music lately?",
  "What's a habit you want to build?",
  "What's a habit you want to break?",
  "What's the best piece of advice you've received recently?",
  "Who is someone you really appreciated today?",
  "What was the most spontaneous thing you did today?",
  "Did you meet anyone new today?",
  "Were you reminscing about anything today?",
  "Who were you thinking about most today?",
  "What's something that surprised you today?",
  "How close was today to your ideal day?",
  "Where did you spend the most time today?",
  "Where was your comfort place of the day?",
  "What's a lyric that's been resonating with you?",
  "When was the last time you cried?",
  "What's the last thing that made you smile widely?",
  "What's a skill you'd like to learn?",
  "What is a shower thought you had today?",
  "Who is someone you are missing today?",
  "What's something you've been avoiding?",
  "What's something you tackled today?",
  "What's a compliment you remember receiving?",
  "What's something you regret saying?",
  "What's an experience you'd love to relive?",
  "What's a tradition you love?",
  "What's a tradition you'd like to start?",
  "When did you get out of bed today?",
  "What's something unexpected that happened today?",
  "Choose a song that feels like your day today.",
  "What's a song that makes you dance?",
  "What did you have for dinner?",
  "What's been the best part of this month?",
  "What's a question you keep asking yourself?",
  "What's something you've changed your mind about?",
  "What did you do for fun today?",
  "What's something you want to try this year?",
  "What's a moment that defined this week?",
  "What's something you're looking forward to tomorrow?",
  "What's a thoughtful thing someone has done for you recently?",
  "What's a small thing you splurged on lately?",
  "Phrase of the day?",
  "What's the last thing you took a picture of?",
  "Lesson of the day?",
  "What's a friendship you're grateful for?",
  "What would your today's self say to your yesterday's self?",
  "What's something you'd like to do less of?",
  "What's something you'd like to do more of?",
  "Recommend a podcast, book, movie, or show that makes you laugh.",
  "Recommend a podcast, book, movie, or show that makes you think.",
  "If you had to be a fictional character, who would you be and why?",
  "What's your go-to comfort food?",
  "OOTD?",
  "What's a small luxury you allow yourself?",
  "Home is where...",
  "Favorite song by an artist you hate?",
  "If you were an ice cream flavor, which one would you be?",
  "What's a chore you actually enjoy?",
  "What's a chore you avoid?",
  "What's something you've been overthinking?",
  "What's the last thing you celebrated?",
  "What's something you want to celebrate soon?",
  "What's a small act of self-care you did today?",
  "What did you have for breakfast?",
  "What's the funniest thing you've heard recently?",
  "What's a hobby you've drifted away from?",
  "What's a hobby you've fallen into?",
  "Where was the furthest place from home that you went to today?",
  "What's something pretty you saw today?",
  "Any memorable smells from today?",
  "Whose voice do you think actually sounds like their personality?",
  "What's something you did today that you don't usually?",
  "What's an answer you've been searching for?",
  "What's a question you've been afraid to ask?",
  "Give one piece of advice to all the children of this world.",
  "What's a texture you love?",
  "What's a colour that's been catching your eye?",
  "Go-to Uber Eats order?",
  "What's an article of clothing that makes you feel good?",
  "What's a meal you make really well?",
  "What's a recipe you want to try?",
  "What's an Olympic sport that should exist?",
  "Top 3 smells?",
  "What's today's theme song?",
  "What's a feeling you can't put into words?",
  "What's a song lyric that resonates with you?",
  "What's a movie quote you live by?",
  "What's a part of your routine that grounds you?",
  "What's a routine you want to change?",
  "What's been your screen time like this week?",
  "What's the last thing you bought yourself?",
  "What's the last gift you gave?",
  "What was the first thing you did after getting out of bed?",
  "What did you wear today?",
  "Today's appreciation?",
  "Rank rice, noodles and bread.",
  "What's something you'd put on your bucket list?",
  "What's something you've crossed off your bucket list?",
  "What's a relationship you're working on?",
  "What's a relationship that's been easy lately?",
  "What's something heavy on your heart?",
  "What's something light on your mind?",
  "What's the last meaningful conversation you had?",
  "What's the last small-talk that made you smile?",
  "What's a moment you wish you could pause?",
  "What's a moment you wish you could rewind?",
  "What's a moment you wish you could fast forward?",
  "How many steps did you take today?",
  "If you were a pizza topping what would you be?",
  "What's something you're looking forward to?",
  "What's something you've been craving?",
  "What's something you've been savouring?",
  "What's the most beautiful sentence you've read recently?",
  "What's a word you've been overusing?",
  "What's a word you wish you used more?",
  "What's been your morning ritual?",
  "What's been your evening ritual?",
  "What was your day like before noon?",
  "What was your day like after noon?",
  "Who's someone you keep thinking about?",
  "What's a place you keep thinking about?",
  "What's a thought you keep returning to?",
  "What's an interesting question someone asked you that you can't stop thinking about?",
  "What's a moment of stillness you had today?",
  "What's something that made you feel small today?",
  "What's something that made you feel big today?",
  "What's something that made you feel seen?",
  "When did you last sing to yourself?",
  "What's a part of your day that felt unhurried?",
  "What's a part of your day that felt rushed?",
  "What's a part of yourself you're working on accepting?",
  "What's a part of yourself you've been celebrating?",
  "What's a fear you've been sitting with?",
  "What's a hope you've been holding onto?",
  "What's a hope that came true recently?",
  "What's a fear that didn't come true?",
  "What did you say no to recently?",
  "What did you say yes to recently?",
  "What's an invitation you wish you'd accepted?",
  "What's an invitation you're glad you declined?",
  "What's a goal you set recently?",
  "What did you appreciate about today?",
  "What's something you want to do tomorrow?",
  "What's a conversation you're currently avoiding?",
  "What's something you'd like to apologize for?",
  "A message for your fans?",
  "What's something you'd like to forgive yourself for?",
  "What's a kindness you'd like to extend to yourself?",
  "What's a kindness you'd like to extend to someone else?",
  "What's something silly that made today bearable?",
  "What's something that made today meaningful?",
  "What's the last thing you did just for fun?",
  "What's a part of life that's currently hard?",
  "What's the last thing you did just because you should?",
  "What's something you did for someone else today?",
  "What's something someone did for you today?",
  "What's a small thing that disrupted your day?",
  "What's a small thing that elevated your day?",
  "Did you do anything whimsical today?",
  "Method of transportation of the day?",
  "When's the last time you sung in front of someone else?",
  "What's something from today that you would like to remember?",
  "What was the last thing you wrote down?",
  "What would constitute a 'perfect' day for you?",
  "What's a task you've been chipping away at?",
  "What's a task you've been putting off?",
  "What's a task you finished recently?",
  "What's something you've improved at recently?",
  "What's something you'd like to improve at?",
  "What's a class you'd love to take?",
  "If you could intervene during any historic event, what would it be?",
  "Who's a teacher you'd like to thank?",
  "What's a mentor who's shaped you?",
  "What would your rapper name be?",
  "What's a piece of advice you've taken to heart?",
  "What's a moment of clarity you've had recently?",
  "What's a moment of confusion you've had recently?",
  "What's a decision you're trying to make?",
  "What's a decision you're glad you made?",
  "Do you have a secret hunch about how you will die?",
  "What's something you've been postponing?",
  "What's a movie you would want to live through?",
  "What's a comfort zone you've been pushing?",
  "What's one super power you would NOT want?",
  "What's been the soundtrack of your week?",
  "What's been the colour palette of your week?",
  "Did you like today's weather?",
  "Give one piece of advice to all the parents of this world.",
  "If you could learn any musical instrument, what would it be?",
  "What's something monotonous you actually enjoy?",
  "What's something exciting that's become normal?",
  "What's something you took for granted today?",
  "What's something you noticed today that you usually miss?",
  "What's a sound from your day that surprised you?",
  "What's a smell from your day that surprised you?",
  "What's a sight from your day that surprised you?",
  "What's a taste from your day that surprised you?",
  "What's something from today that you know you'll miss?",
  "What do you value most in a friendship?",
  "What's the last meal you really enjoyed?",
  "Any food places you're really missing right now?",
  "What's a meal that brings back memories?",
  "What's a smell that smells like home?",
  "Hot take?",
  "What's a part of life you're grateful is over?",
  "Are you happy with your current sleep schedule?",
  "What emotions did you feel most strongly today?",
  "What is your drink of choice?",
  "What's something you'd like to leave behind?",
  "Current favourite dessert?",
  "If you could change anything about the way you were raised, what would it be?",
  "What are you proud of today?",
  "What did you learn about yourself today?",
  "What's a thought you'd like to keep around?",
  "What's a memory that today reminded you of?",
  "Invent a holiday.",
  "What's a question someone asked that surprised you?",
  "What's a question you asked someone today?",
  "What's something you've been hooked on lately?",
  "What's something you wish you had said today?",
  "What's something you said and were glad you did?",
  "What's a piece of yourself you shared today?",
  "Did you compliment anyone today?",
  "Did you enjoy today's temperature?",
  "Where did your feet take you today?",
  "What's your favourite holiday?",
  "Are you hungry?",
  "What would you say is the most normal thing about you?",
  "Go-to karaoke song?",
  "Given the choice of anyone in the world, whom would you want as a dinner guest?",
  "How long did you spend sitting down today?",
  "Favourite piece of clothing you wore today?",
  "What did your body need today?",
  "What did your body get today?",
  "What's a movement that felt good today?",
  "What's a stillness that felt good today?",
  "What sort of exercise have you been wanting to do lately?",
  "Who did you text today?",
  "What's the most useful thing you did today?",
  "What's the most useless thing you did today?",
  "What's something pointless that brought you joy?",
  "What's something productive that drained you?",
  "What's a list you'd love to make?",
  "What's a list you wish someone would write for you?",
  "What's something you keep rereading?",
  "What's something you keep rewatching?",
  "What's something you can't bring yourself to watch?",
  "What's something you can't bring yourself to read?",
  "What's a topic you can talk about forever?",
  "What's a topic you avoid?",
  "What's a fact you learned recently that surprised you?",
  "What's a fact you wish weren't true?",
  "Who would you outlive in a zombie apocalypse?",
  "Two truths one lie?",
  "What's a story you keep telling about yourself?",
  "What's a story about yourself you'd like to rewrite?",
  "What was your first thought this morning?",
  "What was your last thought before bed last night?",
  "What's the longest you laughed today?",
  "What's the longest you stayed quiet today?",
  "What's the most you spoke today?",
  "What's the most you listened today?",
  "What's a way you've been showing up for yourself?",
  "What's a way you've been showing up for others?",
  "What's something you didn't do today that you usually do?",
  "What's a question you'd like answered honestly?",
  "What's a question only you can answer?",
  "What's a question you're still figuring out?",
  "What's a part of life that's currently easy?",
  "What's a part of life you wish lasted longer?",
  "What's a moment you'd describe as cinematic?",
  "What's a moment you'd describe as ordinary?",
  "What's a moment from today you'd put in a movie?",
  "What was the energy of your conversations today?",
  "What was the energy of your texts today?",
  "What's a notification that made your day?",
  "What's a notification you'd love to never see again?",
  "What's been your phone usage like today?",
  "What's been your screen vs sky ratio today?",
  "What did you do that wasn't on a screen today?",
  "What did you do that was on a screen today?",
  "What's a meal you ate alone today?",
  "What's a meal you ate with someone today?",
  "What's a meal you wish you'd shared?",
  "What's a feeling you wish you'd shared?",
  "What's a moment you wish you'd shared?",
  "What's something you're keeping close to your chest?",
  "What's something you're ready to release?",
  "What's a chapter of life you feel is closing?",
  "What's a chapter of life you feel is opening?",
  "What's a metaphor for how you feel today?",
  "Who's someone you want to tell about your day today?",
  "Where should't you bring a dinosaur?",
  "Would you rather wear shoes every single second of the rest of your life or never be allowed to wear shoes again?",
  "Do you prefer creamy or crunchy peanut butter? Or are you allergic :(",
  "What's something heavy you set down today?",
  "What's something light you picked up today?",
  "What did you build today?",
  "What did you break today?",
  "What's a recurring word in your mind these days?",
  "What's a recurring feeling these days?",
  "What did you fix today?",
  "What did you neglect today?",
  "What did you tend to today?",
  "What did you let go of today?",
  "What did you grasp today?",
  "What made you excited to get up in the morning today?",
  "What's something new you did today?",
  "On an average day, how many pigeons do you think you could reasonably carry?",
  "What language did you think in most today?",
  "If all animals were the same size, what would win in a fight?",
  "What are you proud of, but never have an excuse to talk about",
  "Conspiracy theory of the day?",
  "Who do you think is the most famous person alive in the world right now?",
  "What's a moment you felt brave today?",
  "What's a moment you felt afraid today?",
  "Inside / outside ratio of your day?",
  "How much did you spend today?",
  "What's something that felt expensive today?",
  "What's been your favourite weather lately?",
  "Rate today's meals on a scale from 1 to 10.",
  "What's been your favourite hour of the day?",
  "What's been your least favourite hour?",
  "What's a recurring image in your mind these days?",
  "What's a recurring dream you've been having?",
  "What's a recurring problem you'd like to solve?",
  "What's something you want to write a letter about?",
  "Who is someone you want to write a letter to?",
  "What's a letter you wish someone would write you?",
  "Who would you want that letter to come from?",
  "What's an old version of you that visited today?",
  "What are you proud of today?",
  "What's a tiny ritual you cherish?",
  "What surprised you about yourself today?",
  "What's something you're saying goodbye to?",
  "What's something you're saying hello to?",
  "Looking back, what was this year about?",
];


function monthDayForIndex(index: number): string {
  let remaining = index;
  for (let month = 1; month <= DAILY_PROMPT_MONTH_LENGTHS.length; month += 1) {
    const daysInMonth = DAILY_PROMPT_MONTH_LENGTHS[month - 1];
    if (remaining < daysInMonth) {
      return `${String(month).padStart(2, "0")}-${String(remaining + 1).padStart(2, "0")}`;
    }
    remaining -= daysInMonth;
  }

  throw new Error(`No Auckland month-day exists for prompt index ${index}.`);
}

function buildDailyPromptCatalog(): DailyPromptSeed[] {
  return LEGACY_PROMPT_TEXTS.map((text, index) => {
    const monthDay = monthDayForIndex(index);
    return {
      id: `prompt-${monthDay}`,
      monthDay,
      text,
      version: DAILY_PROMPT_VERSION_1,
      effectiveDate: DAILY_PROMPT_VERSION_1_EFFECTIVE_DATE,
      source: DAILY_PROMPT_SOURCE,
      sourceCommit: DAILY_PROMPT_SOURCE_COMMIT,
    };
  });
}

export function validateDailyPromptCatalog(
  catalog: readonly DailyPromptSeed[],
): void {
  const expectedDays = DAILY_PROMPT_MONTH_LENGTHS.reduce(
    (total, days) => total + days,
    0,
  );

  if (catalog.length !== expectedDays) {
    throw new Error(`Expected ${expectedDays} daily prompts, got ${catalog.length}.`);
  }

  const ids = new Set<string>();
  const monthDays = new Set<string>();

  for (const [index, prompt] of catalog.entries()) {
    const expectedMonthDay = monthDayForIndex(index);
    if (prompt.id !== `prompt-${expectedMonthDay}`) {
      throw new Error(`Prompt ${index + 1} has an unstable ID.`);
    }
    if (prompt.monthDay !== expectedMonthDay) {
      throw new Error(`Prompt ${prompt.id} has an unexpected month-day.`);
    }
    if (prompt.version !== DAILY_PROMPT_VERSION_1) {
      throw new Error(`Prompt ${prompt.id} is not version one reference data.`);
    }
    if (prompt.effectiveDate !== DAILY_PROMPT_VERSION_1_EFFECTIVE_DATE) {
      throw new Error(`Prompt ${prompt.id} has an unexpected effective date.`);
    }
    if (prompt.source !== DAILY_PROMPT_SOURCE || prompt.sourceCommit !== DAILY_PROMPT_SOURCE_COMMIT) {
      throw new Error(`Prompt ${prompt.id} is missing source attribution.`);
    }
    if (prompt.text.trim() !== prompt.text || Array.from(prompt.text).length === 0) {
      throw new Error(`Prompt ${prompt.id} has invalid text.`);
    }
    if (Array.from(prompt.text).length > DAILY_PROMPT_TEXT_MAX_CODE_POINTS) {
      throw new Error(`Prompt ${prompt.id} exceeds the text limit.`);
    }
    if (ids.has(prompt.id) || monthDays.has(prompt.monthDay)) {
      throw new Error(`Prompt catalog contains a duplicate at ${prompt.id}.`);
    }
    ids.add(prompt.id);
    monthDays.add(prompt.monthDay);
  }
}

export const dailyPromptCatalog = buildDailyPromptCatalog();
validateDailyPromptCatalog(dailyPromptCatalog);

/** Alias used by migration/seed callers that prefer the explicit seed name. */
export const DAILY_PROMPT_SEED = dailyPromptCatalog;

/** Select the newest scheduled version that is effective on an Auckland date. */
export function selectDailyPromptVersion(
  catalog: readonly DailyPromptSeed[],
  monthDay: string,
  effectiveDate: string,
): DailyPromptSeed | undefined {
  return catalog
    .filter((prompt) => prompt.monthDay === monthDay && prompt.effectiveDate <= effectiveDate)
    .sort((left, right) =>
      left.effectiveDate.localeCompare(right.effectiveDate) || left.version - right.version,
    )
    .at(-1);
}

export async function seedDailyPrompts(db: DayliDatabase): Promise<DailyPrompt[]> {
  return db
    .insert(dailyPrompts)
    .values([...dailyPromptCatalog])
    .onConflictDoNothing()
    .returning();
}
