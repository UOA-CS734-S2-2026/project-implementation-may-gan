"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FormInput } from "@/components/ui/FormInput";
import { MediaInput } from "@/components/ui/MediaInput";
import { Button } from "@/components/ui/core/Button";
import {
  createDailyPostSubmitter,
  validatePostMedia,
  type ApiFailure,
  type PostingDay,
} from "@/lib/api/daily-posts";
import AudienceInput from "@/components/ui/AudienceInput";
import RatingInput from "@/components/ui/RatingInput";

const postSchema = z.object({
  promptResponse: z
    .string()
    .trim()
    .min(1, "Please respond to the daily prompt")
    .refine(
      (value) => Array.from(value).length <= 4000,
      "Your response must be at most 4000 characters"
    ),
  // Set by the slider, which starts unset.
  dayRating: z
    .number({ error: "Rating must be between 1 and 10" })
    .int()
    .min(1, "Rating must be between 1 and 10")
    .max(10, "Rating must be between 1 and 10"),
  caption: z
    .string()
    .trim()
    .refine(
      (value) => Array.from(value).length <= 1000,
      "Word dump must be at most 1000 characters"
    )
    .optional(),
  tomorrowNote: z
    .string()
    .trim()
    .refine(
      (value) => Array.from(value).length <= 1000,
      "Your note must be at most 1000 characters"
    )
    .optional(),
  // No default: the author must choose who can see the post.
  audience: z.enum(["friends", "solo"], {
    error: "Choose who can see this dayli",
  }),
  media: z.array(z.instanceof(File)).superRefine((files, context) => {
    const message = validatePostMedia(files);
    if (message) context.addIssue({ code: "custom", message });
  }),
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
      return "You seem to be offline. Try again when you're connected. It won't be posted twice.";
    case "unavailable":
      return "Dayli is having trouble right now. Try again shortly.";
    case "invalid":
      return failure.message;
    case "unauthenticated":
      return "Your session has ended. Sign in again to post.";
    case "conflict":
      switch (failure.reason) {
        case "POSTING_DAY_CLOSED":
          return "Today's posting window closed at midnight, so this dayli can't be posted.";
        case "POSTING_DAY_NOT_OPEN":
        case "PROMPT_CHANGED":
          return "The day's prompt has changed. We've refreshed it, so check your answer and post again.";
        case "ALREADY_POSTED":
          return "A post already exists for today. Your current edits were not saved and remain in this form. Copy them before leaving this page.";
        case "IDEMPOTENCY_KEY_REUSED":
          return "An earlier version of this draft was already posted. These edits cannot be posted with this submission key, so copy them before leaving this page.";
        case "POST_TRASHED":
          return "This dayli was posted and then moved to Trash. Your words are still here; post again to share them.";
        case "MEDIA_NOT_READY":
          return "An attachment is still being checked. Try posting again shortly.";
        case "MEDIA_UNAVAILABLE":
          return "An attachment is no longer available. Post again to upload it again.";
        default:
          return failure.message;
      }
  }
}

export default function PostForm({
  postingDay,
  onPostingDayChanged,
}: PostFormProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  // One key per draft: every retry of this draft reuses it, so a lost
  // response can be retried without ever creating a second post.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [submitPost] = useState(() => createDailyPostSubmitter());

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting, errors },
  } = useForm<PostValues>({
    resolver: zodResolver(postSchema),
    defaultValues: {
      media: [],
    },
  });

  const onSubmit = async ({
    promptResponse,
    dayRating,
    caption,
    tomorrowNote,
    audience,
    media,
  }: PostValues) => {
    const result = await submitPost(
      {
        localDate: postingDay.localDate,
        promptId: postingDay.prompt.id,
        reflectiveAnswer: promptResponse,
        rating: dayRating,
        audience,
        ...(caption ? { caption } : {}),
        ...(tomorrowNote ? { tomorrowNote } : {}),
      },
      media,
      idempotencyKey
    );

    if (result.ok) {
      // The new post changes the author's archive and streak.
      void queryClient.invalidateQueries({ queryKey: ["profiles"] });
      void queryClient.invalidateQueries({ queryKey: ["posts"] });
      router.push("/");
      return;
    }

    const { failure } = result;
    if (failure.kind === "unauthenticated") {
      router.replace("/sign-in");
      return;
    }
    if (
      failure.kind === "conflict" &&
      (failure.reason === "PROMPT_CHANGED" ||
        failure.reason === "POSTING_DAY_NOT_OPEN")
    ) {
      onPostingDayChanged();
    }
    // That submission was posted and then moved to Trash; a new key posts these words again.
    if (failure.kind === "conflict" && failure.reason === "POST_TRASHED") {
      setIdempotencyKey(crypto.randomUUID());
    }
    setError("root", { message: failureMessage(failure) });
  };

  return (
    <div className="p-8 bg-white rounded-2xl shadow-card">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <fieldset disabled={isSubmitting} className="space-y-4">
          <div inert={isSubmitting}>
            <MediaInput control={control} name="media" />
          </div>

          <p className="text-sm text-foreground-secondary">
            Add up to 3 photos or 1 video (up to 15 seconds). Each file can be
            up to 10 MB, with 25 MB total. Photos and videos are optional.
          </p>

          <div className="space-y-5 mt-9">
            <h2 className="pt-5 font-semibold tracking-tighter font-serif text-xl pb-2">
              A bit about your day...
            </h2>
            <RatingInput control={control} name="dayRating" />
            <FormInput
              control={control}
              name="promptResponse"
              label={postingDay.prompt.text}
              variant="posts"
            />
            <FormInput
              control={control}
              name="caption"
              label="Word dump"
              variant="posts"
              multiline
              rows={4}
            />
            <FormInput
              control={control}
              name="tomorrowNote"
              label="Note to tomorrow's you (only you can read it, from tomorrow)"
              placeholder="Something to remember tomorrow (optional)"
              variant="posts"
              multiline
              rows={2}
            />
            <AudienceInput control={control} name="audience" />

            {errors.root && (
              <p className="text-sm text-red-500">{errors.root.message}</p>
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
        </fieldset>
      </form>
    </div>
  );
}
