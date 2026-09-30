"use client";

import Image from "next/image";
import Link from "next/link";
import React, { useMemo } from "react";
import { isVideo, PrivateImage, type PrivateMediaItem } from "@/features/posts/shared/PrivateMedia";

type PostCardProps = {
  postId: string;
  username: string;
  displayName: string;
  userImage?: string | null;
  prompt?: string;
  promptResponse: string;
  /** The post's first attachment, shown on the card. */
  media?: PrivateMediaItem | null;
  createdAt: Date | string;
  /** A short note for the author, such as who can see the post. */
  label?: string;
};

const getRotation = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }

  // Mix it up more to ensure differences even for similar/sequential IDs
  hash = Math.imul(hash ^ (hash >>> 15), 0x735a2d97);
  hash = hash ^ (hash >>> 15);

  // ensure hash is positive and scale to -5 to +5 range
  return (Math.abs(hash) % 100) / 10 - 5;
};

export function PostCard({
  postId,
  username,
  displayName,
  userImage,
  prompt,
  promptResponse,
  media,
  createdAt,
  label,
}: PostCardProps) {
  const NZ_TIME_ZONE = "Pacific/Auckland";
  const time = new Intl.DateTimeFormat("en-NZ", {
    timeZone: NZ_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(createdAt));
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: NZ_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(createdAt));
  const rotation = useMemo(() => getRotation(postId), [postId]);

  return (
    <article
      className="relative flex flex-col h-full rounded-sm bg-white shadow-md w-full min-w-75 overflow-hidden border-white
      transition duration-500 hover:duration-300 hover:border hover:border-background-tertiary hover:z-1 hover:-translate-y-1 hover:-translate-x-1 hover:-rotate-2 hover:scale-[1.03] hover:shadow-xl"
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      {/* The whole card opens the post. The author link sits above it. */}
      <Link
        href={`/u/${encodeURIComponent(username)}/${encodeURIComponent(postId)}`}
        aria-label={`Open ${displayName}'s dayli from ${date}`}
        className="absolute inset-0 z-0"
      />
      <div className="m-5 mb-0 shrink-0">
        {media ? (
          <div className="relative aspect-square w-full overflow-hidden bg-background-secondary">
            {isVideo(media) ? (
              // Videos play in the post itself; the feed never autoplays them.
              <div className="absolute inset-0 grid place-items-center bg-foreground text-white">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-14 w-14" fill="currentColor">
                  <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14Z" />
                </svg>
                <span className="sr-only">Video</span>
              </div>
            ) : (
              <PrivateImage
                postId={postId}
                media={media}
                alt={`${displayName}'s photo`}
                sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
              />
            )}
          </div>
        ) : (
          <div className="aspect-square w-full bg-background-secondary" />
        )}
      </div>

      <div className="flex flex-col flex-1 gap-3 p-4">
        <Link
          href={`/u/${encodeURIComponent(username)}`}
          className="relative z-10 flex items-center gap-2 self-start hover:opacity-70 transition-opacity"
        >
          {userImage ? (
            <Image
              src={userImage}
              alt={displayName}
              width={36}
              height={36}
              className="rounded-full object-cover shrink-0"
            />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background-accent text-xs font-semibold text-foreground-accent">
              {displayName?.[0]?.toUpperCase() ?? "?"}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {displayName}
            </p>
            <p className="text-xs text-foreground-secondary truncate">
              @{username}
            </p>
          </div>
        </Link>

        <div className="flex flex-col gap-1">
          {prompt && (
            <p className="text-xs text-foreground-secondary line-clamp-1">
              {prompt}
            </p>
          )}
          {/* Clamped whole lines only; the full answer is on the post page. */}
          <p className="text-sm text-foreground line-clamp-3">
            {promptResponse}
          </p>
        </div>

        <div className="mt-auto flex items-center gap-2">
          {label && (
            <span className="rounded-full bg-background-secondary px-2 py-0.5 text-xs text-foreground-secondary">
              {label}
            </span>
          )}
          <p className="ml-auto text-xs text-foreground-secondary">
            {date} | {time}
          </p>
        </div>
      </div>
    </article>
  );
}
