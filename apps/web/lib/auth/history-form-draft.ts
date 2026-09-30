import { useEffect } from "react";
import type { FieldValues, UseFormReset, UseFormWatch } from "react-hook-form";

type HistoryState = {
  dayliAuthFormDrafts?: Record<string, FieldValues>;
};

export function useHistoryFormDraft<T extends FieldValues>(
  key: string,
  reset: UseFormReset<T>,
  watch: UseFormWatch<T>,
) {
  useEffect(() => {
    // Keep the draft in the current history entry, never in persistent app storage.
    // Clear it after successful sign-in or sign-up so it does not outlive the draft.
    const state = window.history.state as HistoryState | null;
    const draft = state?.dayliAuthFormDrafts?.[key] as T | undefined;
    if (draft) reset(draft);

    const subscription = watch((values) => {
      const current = (window.history.state ?? {}) as HistoryState;
      window.history.replaceState(
        {
          ...current,
          dayliAuthFormDrafts: {
            ...current.dayliAuthFormDrafts,
            [key]: values,
          },
        },
        "",
      );
    });
    return () => subscription.unsubscribe();
  }, [key, reset, watch]);
}

export function clearHistoryFormDraft(key: string) {
  const current = (window.history.state ?? {}) as HistoryState;
  if (!current.dayliAuthFormDrafts?.[key]) return;
  const remaining = { ...current.dayliAuthFormDrafts };
  delete remaining[key];
  window.history.replaceState(
    { ...current, dayliAuthFormDrafts: remaining },
    "",
  );
}
