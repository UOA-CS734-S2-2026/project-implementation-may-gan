"use client";

import Image from "next/image";
import { useState } from "react";
import { postsApi } from "@/features/posts/shared/posts.api";

/** The fields a private attachment needs to display and refresh itself. */
export type PrivateMediaItem = {
  id: string;
  contentType: string;
  url: string | null;
};

export const isVideo = (media: Pick<PrivateMediaItem, "contentType">) => media.contentType.startsWith("video/");

/**
 * Signed URLs expire after a few minutes, and a loaded post can outlive them.
 * On a load error this asks once for a fresh URL; a second failure gives up.
 */
function usePrivateMediaUrl(postId: string, media: PrivateMediaItem) {
  const [state, setState] = useState({ source: media.url, url: media.url, refreshed: false, failed: false });
  // A refetched post brings a new URL: start over with it. Adjusting state
  // while rendering, rather than in an effect, avoids a stale first paint.
  if (state.source !== media.url) {
    setState({ source: media.url, url: media.url, refreshed: false, failed: false });
  }

  async function onError() {
    if (state.refreshed) {
      setState((current) => ({ ...current, failed: true }));
      return;
    }
    setState((current) => ({ ...current, refreshed: true }));
    const result = await postsApi.media(postId, media.id);
    setState((current) => result.ok && result.value.url
      ? { ...current, url: result.value.url }
      : { ...current, failed: true });
  }

  return { url: state.failed ? null : state.url, onError: () => void onError() };
}

function Unavailable({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-background-secondary text-sm text-foreground-tertiary">
      {label}
    </div>
  );
}

/**
 * A private photo. Never pass these through the Next image optimizer: it would
 * fetch and cache private media on the server, so it stays unoptimized and R2
 * is deliberately absent from next.config's remotePatterns.
 */
export function PrivateImage({ postId, media, alt, sizes }: {
  postId: string;
  media: PrivateMediaItem;
  alt: string;
  sizes: string;
}) {
  const { url, onError } = usePrivateMediaUrl(postId, media);
  if (!url) return <Unavailable label="Photo unavailable" />;
  return (
    <Image
      src={url}
      alt={alt}
      fill
      sizes={sizes}
      className="object-cover"
      unoptimized
      referrerPolicy="no-referrer"
      onError={onError}
    />
  );
}

/**
 * A private video for the post page. It starts playing on its own, muted,
 * because browsers block autoplay with sound, and loops, since clips are at
 * most 15 seconds; the controls let the viewer unmute or pause. The feed
 * never renders this: it shows a still tile instead.
 */
export function PrivateVideo({ postId, media, label }: {
  postId: string;
  media: PrivateMediaItem;
  label: string;
}) {
  const { url, onError } = usePrivateMediaUrl(postId, media);
  if (!url) return <Unavailable label="Video unavailable" />;
  return (
    <video
      src={url}
      aria-label={label}
      className="absolute inset-0 h-full w-full bg-black object-contain"
      autoPlay
      muted
      loop
      controls
      playsInline
      onError={onError}
    />
  );
}
