import type { AucklandDayService, ClockLike } from "@dayli/domain";

export interface DailyPromptRecord {
  id: string;
  text: string;
  version: number;
  effectiveDate: string;
}

export interface DailyPromptRepository {
  findActivePrompt(monthDay: string, localDate: string): Promise<DailyPromptRecord | null>;
}

export interface PostingDayOperationalAlert {
  code: "MISSING_DAILY_PROMPT";
  localDate: string;
  monthDay: string;
}

export class MissingDailyPromptError extends Error {
  readonly localDate: string;
  readonly monthDay: string;

  constructor(localDate: string, monthDay: string) {
    super("No approved daily prompt is available for the current Auckland day.");
    this.name = "MissingDailyPromptError";
    this.localDate = localDate;
    this.monthDay = monthDay;
  }
}

export class PostingDayDependencyUnavailableError extends Error {
  constructor() {
    super("The posting state dependency is not available.");
    this.name = "PostingDayDependencyUnavailableError";
  }
}

export interface CurrentPostingDay {
  serverNow: Date;
  localDate: string;
  deadlineAt: Date;
  releaseAt: Date;
  prompt: Pick<DailyPromptRecord, "id" | "text">;
  hasPosted: boolean;
}

export interface CurrentPostingDayService {
  getCurrentPostingDay(userId: string): Promise<CurrentPostingDay>;
}

export interface CurrentPostingDayServiceDependencies {
  clock: ClockLike;
  dayService: AucklandDayService;
  prompts: DailyPromptRepository;
  /** Supplied by the #13 posts integration; absence is never treated as false. */
  hasPosted?: (userId: string, localDate: string) => Promise<boolean>;
  onOperationalAlert: (alert: PostingDayOperationalAlert) => void | Promise<void>;
}

function readNow(clock: ClockLike): Date {
  const now = typeof clock === "function" ? clock() : clock.now();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError("The clock must return a valid Date.");
  }
  return new Date(now.getTime());
}

async function reportMissingPrompt(
  onOperationalAlert: CurrentPostingDayServiceDependencies["onOperationalAlert"],
  alert: PostingDayOperationalAlert,
): Promise<void> {
  try {
    await onOperationalAlert(alert);
  } catch {
    // Alert delivery must not expose prompt or user data through the API.
  }
}

export function createCurrentPostingDayService(
  dependencies: CurrentPostingDayServiceDependencies,
): CurrentPostingDayService {
  return {
    async getCurrentPostingDay(userId) {
      const serverNow = readNow(dependencies.clock);
      const day = dependencies.dayService.forInstant(serverNow);
      const monthDay = day.localDate.slice(5);
      const prompt = await dependencies.prompts.findActivePrompt(monthDay, day.localDate);

      if (!prompt) {
        await reportMissingPrompt(dependencies.onOperationalAlert, {
          code: "MISSING_DAILY_PROMPT",
          localDate: day.localDate,
          monthDay,
        });
        throw new MissingDailyPromptError(day.localDate, monthDay);
      }

      if (!dependencies.hasPosted) {
        throw new PostingDayDependencyUnavailableError();
      }

      const hasPosted = await dependencies.hasPosted(userId, day.localDate);
      return {
        serverNow,
        localDate: day.localDate,
        deadlineAt: day.nextMidnightUtc,
        releaseAt: day.nextMidnightUtc,
        prompt: { id: prompt.id, text: prompt.text },
        hasPosted,
      };
    },
  };
}
