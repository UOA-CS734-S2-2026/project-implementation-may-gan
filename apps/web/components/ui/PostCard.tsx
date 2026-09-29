import Image from "next/image";
import Link from "next/link";
import React, { useMemo } from "react";
import { Button } from "@/components/ui/core/Button";

type PostCardProps = {
  postId: string;
  username: string;
  displayName: string;
  userImage?: string | null;
  promptResponse: string;
  mediaUrl?: string | null;
  createdAt: Date | string;
};

export const isVideoMediaUrl = (mediaUrl: string) =>
  /\/video\//i.test(mediaUrl) ||
  /\.(mp4|mov|webm|m4v)(?:$|[?#])/i.test(mediaUrl);

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
  promptResponse,
  mediaUrl,
  createdAt,
}: PostCardProps) {
  const postImageUrl = mediaUrl?.trim() || null;
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
  const isVideo = postImageUrl ? isVideoMediaUrl(postImageUrl) : false;
  const rotation = useMemo(() => getRotation(postId), [postId]);

  return (
    <div
      className="flex flex-col rounded-sm bg-white shadow-md w-full min-w-75 aspect-4/6 overflow-hidden border-white
      transition duration-500 hover:duration-300 hover:border hover:border-background-tertiary hover:z-1 hover:-translate-y-1 hover:-translate-x-1 hover:-rotate-2 hover:scale-[1.03] hover:shadow-xl"
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <div className="m-5 mb-0 shrink-0">
        {postImageUrl ? (
          <div className="relative aspect-square w-full overflow-hidden bg-background-secondary">
            {isVideo ? (
              <video
                src={postImageUrl}
                className="absolute inset-0 h-full w-full object-cover"
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
              />
            ) : (
              <Image
                src={postImageUrl}
                alt={`${username}'s post`}
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 100vw"
                className="object-cover"
                unoptimized
              />
            )}
          </div>
        ) : (
          <div className="aspect-square w-full bg-background-secondary" />
        )}
      </div>

      <div className="flex flex-col flex-1 min-h-0 gap-3 p-4">
        <Link
          href={`/u/${encodeURIComponent(username)}`}
          className="flex items-center gap-2 hover:opacity-70 transition-opacity"
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

        <p className="text-sm text-foreground line-clamp-2 overflow-hidden flex-1 min-h-0">
          {promptResponse}
        </p>

        <div className="flex items-center justify-between">
          <Button
            href={`/u/${encodeURIComponent(username)}/${encodeURIComponent(postId)}`}
            variant={{ color: "accent", size: "sm", weight: "secondary" }}
            arrow
          >
            See more
          </Button>
          <span className="text-xs text-foreground-secondary">
            {date} | {time}
          </span>
        </div>
      </div>
    </div>
  );
}
