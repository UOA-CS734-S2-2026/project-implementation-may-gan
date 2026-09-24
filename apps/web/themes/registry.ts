export const THEMES = [
  { id: "default", name: "Default (Light)" },
  { id: "dark", name: "Dark" },
] as const;

export const DEFAULT_THEME_ID =
  "default" satisfies (typeof THEMES)[number]["id"];

export type ThemeId = (typeof THEMES)[number]["id"];
