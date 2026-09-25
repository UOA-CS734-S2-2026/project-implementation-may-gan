"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FormInput } from "@/components/ui/FormInput";
import { MediaInput } from "@/components/ui/MediaInput";
import { Button } from "@/components/ui/core/Button";
import {
  submitDailyPost,
  type ApiFailure,
  type PostingDay,
} from "@/lib/api/daily-posts";

const postSchema = z.object({
  promptResponse: z
    .string()
    .trim()
    .min(1, "Please respond to the daily prompt")
    .refine(
      (value) => Array.from(value).length <= 4000,
      "Your response must be at most 4000 characters"
    ),
  dayRating: z.coerce
    .number<number>()
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
  media: z.array(z.instanceof(File)).refine(
    (files) => {
      if (!files?.length) return true;

      const images = files.filter((f) => f.type.startsWith("image/"));
      const videos = files.filter((f) => f.type.startsWith("video/"));

      if (images.length && videos.length) return false;
      if (images.length > 3) return false;
      if (videos.length > 1) return false;

      return true;
    },
    {
      message: "Upload max 3 images or 1 video",
    }
  ),
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
        default:
          return failure.message;
      }
  }
}

export default function PostForm({
  postingDay,
  onPostingDayChanged,
}: PostFormProps) {
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
      media: [],
    },
  });

  const media = useWatch({ control, name: "media" });
  const hasMedia = media && media.length > 0;

  const onSubmit = async ({
    promptResponse,
    dayRating,
    caption,
    media,
  }: PostValues) => {
    if (!media?.length) {
      setError("media", { message: "Please upload at least one file" });
      return;
    }

    // Media upload arrives with the media API; until then the post is sent as
    // text only and the chosen files stay on this device.
    const result = await submitDailyPost(
      {
        localDate: postingDay.localDate,
        promptId: postingDay.prompt.id,
        reflectiveAnswer: promptResponse,
        rating: dayRating,
        audience: "friends",
        ...(caption ? { caption } : {}),
      },
      idempotencyKey
    );

    if (result.ok) {
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
      (failure.reason === "ALREADY_POSTED" ||
        failure.reason === "IDEMPOTENCY_KEY_REUSED")
    ) {
      router.push("/");
      return;
    }
    if (
      failure.kind === "conflict" &&
      (failure.reason === "PROMPT_CHANGED" ||
        failure.reason === "POSTING_DAY_NOT_OPEN")
    ) {
      onPostingDayChanged();
    }
    setError("root", { message: failureMessage(failure) });
  };

  return (
    <div className="p-8 bg-white rounded-2xl shadow-card">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <MediaInput control={control} name="media" />

        {hasMedia && (
          <div className="space-y-5 mt-9">
            <h2 className="pt-5 font-semibold tracking-tighter font-serif text-xl pb-2">
              A bit about your day...
            </h2>
            <FormInput
              control={control}
              name="dayRating"
              label="Day rating"
              type="number"
              variant="posts"
            />
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
        )}
      </form>
    </div>
  );
}
