"use client";

import { useState } from "react";
import { useForm, useController, type Control } from "react-hook-form";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { FormInput } from "@/components/ui/FormInput";
import { Button } from "@/components/ui/core/Button";
import {
  submitDailyPost,
  type ApiFailure,
  type PostingDay,
} from "@/lib/api/daily-posts";

// Limits mirror the server contract; the API remains authoritative.
const optionalText = (maximum: number, label: string) =>
  z
    .string()
    .trim()
    .refine((value) => Array.from(value).length <= maximum, `${label} must be at most ${maximum} characters`)
    .optional();

const postSchema = z.object({
  promptResponse: z
    .string()
    .trim()
    .min(1, "Please respond to the daily prompt")
    .refine((value) => Array.from(value).length <= 4000, "Your response must be at most 4000 characters"),
  dayRating: z.coerce
    .number<number>({ error: "Rate your day from 1 to 10" })
    .int("Rating must be a whole number")
    .min(1, "Rating must be between 1 and 10")
    .max(10, "Rating must be between 1 and 10"),
  caption: optionalText(1000, "Word dump"),
  audience: z.enum(["friends", "solo"]),
  tomorrowNote: optionalText(1000, "Your note"),
});

type PostValues = z.infer<typeof postSchema>;

interface PostFormProps {
  postingDay: PostingDay;
  /** Called when the server's posting day no longer matches this draft. */
  onPostingDayChanged: () => void;
}

function failureMessage(failure: ApiFailure): string {
  switch (failure.kind) {
    case "network":
      return "You seem to be offline. Your dayli is still here, so try again when you're connected. It won't be posted twice.";
    case "unavailable":
      return "Dayli is having trouble right now. Your dayli is still here, so try again shortly.";
    case "invalid":
      return failure.message;
    case "unauthenticated":
      return "Your session has ended. Sign in again to post.";
    case "conflict":
      switch (failure.reason) {
        case "POSTING_DAY_CLOSED":
          return "Today's posting window closed at midnight, so this dayli can't be posted. Your words are still here to keep.";
        case "POSTING_DAY_NOT_OPEN":
        case "PROMPT_CHANGED":
          return "The day's prompt has changed. We've refreshed it, so check your answer and post again.";
        default:
          return failure.message;
      }
  }
}

function AudienceInput({ control }: { control: Control<PostValues> }) {
  const { field } = useController({ control, name: "audience" });
  const options = [
    { value: "friends", label: "Friends", hint: "Your friends see it after midnight" },
    { value: "solo", label: "Just me", hint: "A private journal entry" },
  ] as const;

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium font-sans">Who can see this?</legend>
      <div className="flex gap-3 pt-1">
        {options.map((option) => (
          <label
            key={option.value}
            className={`flex-1 cursor-pointer rounded-md px-3 py-2 text-sm transition-colors ${
              field.value === option.value
                ? "bg-background-accent text-foreground-accent"
                : "bg-background-secondary text-foreground-secondary hover:opacity-80"
            }`}
          >
            <input
              type="radio"
              name={field.name}
              value={option.value}
              checked={field.value === option.value}
              onChange={() => field.onChange(option.value)}
              className="sr-only"
            />
            <span className="block font-semibold">{option.label}</span>
            <span className="block text-xs opacity-80">{option.hint}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function PostForm({ postingDay, onPostingDayChanged }: PostFormProps) {
  const router = useRouter();
  // One key per draft: every retry of this draft reuses it, so a lost
  // response can be retried without ever creating a second post.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting, errors },
  } = useForm<PostValues>({
    resolver: zodResolver(postSchema),
    defaultValues: {
      promptResponse: "",
      caption: "",
      audience: "friends",
      tomorrowNote: "",
    },
  });

  const onSubmit = async ({ promptResponse, dayRating, caption, audience, tomorrowNote }: PostValues) => {
    const result = await submitDailyPost({
      localDate: postingDay.localDate,
      promptId: postingDay.prompt.id,
      reflectiveAnswer: promptResponse,
      rating: dayRating,
      audience,
      ...(caption ? { caption } : {}),
      ...(tomorrowNote ? { tomorrowNote } : {}),
    }, idempotencyKey);

    if (result.ok) {
      toast.success(audience === "solo"
        ? "Your dayli is saved to your journal."
        : "Your dayli is in. Friends will see it after midnight.");
      router.push("/home");
      return;
    }

    const { failure } = result;
    if (failure.kind === "unauthenticated") {
      router.replace("/sign-in");
      return;
    }
    if (failure.kind === "conflict" && (failure.reason === "ALREADY_POSTED" || failure.reason === "IDEMPOTENCY_KEY_REUSED")) {
      toast.info("You've already posted today's dayli.");
      router.push("/home");
      return;
    }
    if (failure.kind === "conflict" && (failure.reason === "PROMPT_CHANGED" || failure.reason === "POSTING_DAY_NOT_OPEN")) {
      onPostingDayChanged();
    }
    setError("root", { message: failureMessage(failure) });
  };

  return (
    <div className="p-8 bg-white rounded-2xl shadow-card">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="rounded-xl border-2 border-dashed border-foreground/10 px-4 py-6 text-center text-sm text-foreground-tertiary">
          Photos and videos are coming soon. For now, share your day in words.
        </div>

        <div className="space-y-5 mt-9">
          <h2 className="pt-5 font-semibold tracking-tighter font-serif text-xl pb-2">
            A bit about your day...
          </h2>
          <FormInput
            control={control}
            name="dayRating"
            label="Day rating (1–10)"
            type="number"
            variant="posts"
          />
          <FormInput
            control={control}
            name="promptResponse"
            label={postingDay.prompt.text}
            variant="posts"
            multiline
            rows={3}
          />
          <FormInput
            control={control}
            name="caption"
            label="Word dump"
            variant="posts"
            multiline
            rows={4}
          />
          <AudienceInput control={control} />
          <FormInput
            control={control}
            name="tomorrowNote"
            label="A note for tomorrow-you (only you can read it, from tomorrow)"
            variant="posts"
            multiline
            rows={2}
          />

          {errors.root && (
            <p role="alert" className="text-sm text-red-500">{errors.root.message}</p>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              disabled={isSubmitting}
              variant={{ weight: "secondary", color: "accent" }}
              arrow
            >
              {isSubmitting ? "Posting..." : "Post"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
