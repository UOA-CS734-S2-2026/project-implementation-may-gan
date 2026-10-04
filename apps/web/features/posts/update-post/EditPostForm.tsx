"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import AudienceInput from "@/components/ui/AudienceInput";
import { Button } from "@/components/ui/core/Button";
import { FormInput } from "@/components/ui/FormInput";
import RatingInput from "@/components/ui/RatingInput";
import type { PostDetail } from "@/features/posts/shared/posts.api";
import { PostApiError } from "@/features/posts/shared/query-result";
import { useUpdatePostMutation } from "./use-update-post-mutation";

const editSchema = z.object({
  reflectiveAnswer: z
    .string()
    .trim()
    .min(1, "Please respond to the daily prompt")
    .refine((value) => Array.from(value).length <= 4000, "Your response must be at most 4000 characters"),
  rating: z.number().int().min(1, "Rating must be between 1 and 10").max(10, "Rating must be between 1 and 10"),
  caption: z
    .string()
    .trim()
    .refine((value) => Array.from(value).length <= 1000, "Word dump must be at most 1000 characters"),
  audience: z.enum(["friends", "solo"]),
});

type EditValues = z.infer<typeof editSchema>;

const failureMessages = {
  conflict: "This dayli was edited somewhere else since you opened it. Load the latest version, check your changes, and save again.",
  notFound: "This dayli isn't available any more. It may have been deleted.",
  invalid: "Check your changes and try again.",
  network: "You seem to be offline. Your changes are still here; try again when you're back online.",
  unauthenticated: "Your session has ended. Sign in again to save your changes.",
  unavailable: "Your changes couldn't be saved right now. Try again.",
} as const;

/**
 * Lets the author change the answer, rating, word dump, and audience of their
 * post. A failed or conflicting save keeps every change in the form.
 */
export function EditPostForm({
  post,
  onDone,
  onReload,
}: {
  post: PostDetail;
  onDone: () => void;
  /**
   * Reads the post again and says whether that worked. The form keeps its
   * values and saves against the new version.
   */
  onReload: () => Promise<boolean>;
}) {
  const save = useUpdatePostMutation(post.id);
  const [reloading, setReloading] = useState(false);
  const [reloaded, setReloaded] = useState(false);
  const [reloadFailed, setReloadFailed] = useState(false);
  const { control, handleSubmit } = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      reflectiveAnswer: post.reflectiveAnswer,
      rating: post.rating,
      caption: post.caption ?? "",
      audience: post.audience,
    },
  });
  const failure = save.error instanceof PostApiError ? save.error.failure : save.isError ? "unavailable" : undefined;

  return (
    <form
      aria-label="Edit this dayli"
      className="space-y-5"
      onSubmit={handleSubmit((values) => {
        setReloaded(false);
        // Every field is sent, so the server only saves what actually changed.
        save.mutate(
          {
            expectedRevisionCount: post.revisionCount,
            reflectiveAnswer: values.reflectiveAnswer,
            rating: values.rating,
            caption: values.caption || null,
            audience: values.audience,
          },
          { onSuccess: onDone },
        );
      })}
    >
      <RatingInput control={control} name="rating" />
      <FormInput control={control} name="reflectiveAnswer" label={post.prompt.text} variant="posts" multiline rows={4} />
      <FormInput control={control} name="caption" label="Word dump" variant="posts" multiline rows={4} />
      <AudienceInput control={control} name="audience" />

      {failure && (
        <div role="alert" className="space-y-2 text-sm text-red-500">
          <p>{failureMessages[failure]}</p>
          {failure === "conflict" && (
            <Button
              type="button"
              disabled={reloading}
              onClick={async () => {
                setReloading(true);
                const loaded = await onReload();
                setReloading(false);
                setReloadFailed(!loaded);
                // Keep the conflict until the newer version is actually here.
                if (!loaded) return;
                save.reset();
                setReloaded(true);
              }}
              variant={{ color: "accent", size: "sm", weight: "secondary" }}
            >
              {reloading ? "Loading..." : "Load the latest version"}
            </Button>
          )}
          {failure === "conflict" && reloadFailed && (
            <p>The latest version couldn&apos;t be loaded. Check your connection and try again.</p>
          )}
        </div>
      )}
      {reloaded && (
        <p role="status" className="text-sm text-foreground-secondary">
          Loaded the latest version. Your changes are still here; check them and save again.
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={save.isPending} variant={{ weight: "secondary", color: "accent", size: "sm" }}>
          {save.isPending ? "Saving..." : "Save changes"}
        </Button>
        <Button type="button" onClick={onDone} disabled={save.isPending} variant={{ weight: "secondary", color: "foreground", size: "sm" }}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
