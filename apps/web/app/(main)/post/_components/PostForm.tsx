"use client";

import { useState, useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FormInput } from "@/components/ui/FormInput";
import { MediaInput } from "@/components/ui/MediaInput";
import { trpc } from "@/lib/trpc/client";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import {
  uploadToCloudinary,
  type UploadedMedia,
} from "@/lib/cloudinary/client";
import { Button } from "@/components/ui/core/Button";

const postSchema = z.object({
  promptResponse: z.string().min(1, "Please respond to the daily prompt"),
  dayRating: z.coerce
    .number<number>()
    .int()
    .min(1, "Rating must be between 1 and 10")
    .max(10, "Rating must be between 1 and 10"),
  caption: z.string().optional(),
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

type ExistingMediaItem = {
  id: string;
  publicId: string;
  url: string;
  type: "IMAGE" | "VIDEO";
  order: number;
};

interface PostFormProps {
  mode?: "create" | "edit";
  postId?: string;
  initialData?: {
    promptResponse: string;
    dayRating: number;
    caption?: string;
    media?: ExistingMediaItem[] | undefined;
  };
}

export default function PostForm({
  mode = "create",
  postId,
  initialData,
}: PostFormProps) {
  const [existingMedia, setExistingMedia] = useState<
    NonNullable<PostFormProps["initialData"]>["media"] | undefined
  >(initialData?.media);
  const [mediaOrder, setMediaOrder] = useState<(File | ExistingMediaItem)[]>(
    initialData?.media ?? []
  );
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: todayPrompt } = trpc.dailyPrompts.getTodayPrompt.useQuery({});

  const {
    control,
    handleSubmit,
    setError,
    reset,
    formState: { isSubmitting, errors },
  } = useForm<PostValues>({
    resolver: zodResolver(postSchema),
    defaultValues: {
      media: [],
      promptResponse: initialData?.promptResponse,
      dayRating: initialData?.dayRating,
      caption: initialData?.caption,
    },
  });

  useEffect(() => {
    if (initialData) {
      reset({
        media: [],
        promptResponse: initialData.promptResponse,
        dayRating: initialData.dayRating,
        caption: initialData.caption,
      });
      Promise.resolve().then(() => {
        setExistingMedia(initialData.media);
        setMediaOrder(initialData.media ?? []);
      });
    }
  }, [initialData, reset]);

  const media = useWatch({ control, name: "media" });
  const hasMedia = media && media.length > 0;

  const createPost = trpc.posts.createPost.useMutation({
    onSuccess: () => {
      utils.posts.getPostForToday.invalidate({});
      router.push("/");
    },
    onError: (e) => {
      setError("root", {
        message: e.message ?? "Something went wrong",
      });
    },
  });

  const editPost = trpc.posts.editPost.useMutation({
    onSuccess: () => {
      utils.posts.getPostForToday.invalidate({});
      router.push("/");
    },
    onError: (e) => {
      setError("root", {
        message: e.message ?? "Something went wrong",
      });
    },
  });

  const onSubmit = async ({
    promptResponse,
    dayRating,
    caption,
    media,
  }: PostValues) => {
    if (mode === "create") {
      if (!media?.length) {
        setError("media", { message: "Please upload at least one file" });
        return;
      }

      try {
        const uploadedMedia: UploadedMedia[] = await Promise.all(
          media.map((file, index) => uploadToCloudinary(file, index))
        );

        const currentDate = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Pacific/Auckland",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());

        await createPost.mutateAsync({
          promptId: `prompt-${currentDate.slice(5)}`,
          promptResponse,
          dayRating,
          localDate: currentDate,
          caption,
          media: uploadedMedia,
        });
      } catch (error) {
        setError("root", {
          message:
            error instanceof Error
              ? error.message
              : "Failed to create your post.",
        });
      }
    } else if (mode === "edit" && postId) {
      if (mediaOrder.length === 0) {
        setError("media", { message: "Please upload at least one file" });
        return;
      }

      try {
        const uploads = await Promise.all(
          mediaOrder.map((item, idx) =>
            item instanceof File
              ? uploadToCloudinary(item, idx)
              : Promise.resolve<UploadedMedia>({
                  publicId: item.publicId,
                  url: item.url,
                  type: item.type,
                  order: idx,
                })
          )
        );

        await editPost.mutateAsync({
          postId,
          promptResponse,
          dayRating,
          caption,
          mediaOrder: uploads.map(({ publicId, url, type }) => ({
            publicId,
            url,
            type,
          })),
        });
      } catch (error) {
        setError("root", {
          message:
            error instanceof Error ? error.message : "Failed to save changes.",
        });
      }
    }
  };

  const isSubmittingMutation =
    isSubmitting || createPost.isPending || editPost.isPending;

  return (
    <>
      <div className="p-8 bg-white rounded-2xl shadow-card">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {(mode === "create" || mode === "edit") && (
            <MediaInput
              control={control}
              name="media"
              existing={existingMedia}
              onOrderChange={setMediaOrder}
            />
          )}

          {(mode === "edit" || hasMedia) && (
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
                label={todayPrompt?.text ?? "Daily prompt:"}
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
                  disabled={isSubmittingMutation}
                  variant={{ weight: "secondary", color: "accent" }}
                  arrow
                >
                  {isSubmittingMutation
                    ? mode === "edit"
                      ? "Saving..."
                      : "Posting..."
                    : mode === "edit"
                      ? "Save changes"
                      : "Post"}
                </Button>
                {mode === "edit" && (
                  <Button
                    type="button"
                    onClick={() => setShowDeleteDialog(true)}
                    variant={{ weight: "secondary", color: "accent" }}
                    className="bg-rose-100 text-rose-600 hover:bg-rose-200"
                  >
                    Delete Post
                  </Button>
                )}
              </div>
            </div>
          )}
        </form>
      </div>

      {mode === "edit" && postId && (
        <DeleteConfirmDialog
          isOpen={showDeleteDialog}
          onClose={() => setShowDeleteDialog(false)}
          postId={postId}
        />
      )}
    </>
  );
}
