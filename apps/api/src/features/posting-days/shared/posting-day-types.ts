export interface DailyPromptRecord {
  id: string;
  text: string;
  version: number;
  effectiveDate: string;
}

export interface DailyPromptRepository {
  findActivePrompt(monthDay: string, localDate: string): Promise<DailyPromptRecord | null>;
}
