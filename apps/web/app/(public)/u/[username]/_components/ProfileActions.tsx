"use client";

import { useState } from "react";
import { Button } from "@/components/ui/core/Button";
import { RemoveFriendDialog } from "./RemoveFriendDialog";

type Relationship = "none" | "friends" | "incoming_pending" | "outgoing_pending";

const LABELS: Record<Relationship, string> = {
  none: "add friend",
  incoming_pending: "accept request",
  outgoing_pending: "requested",
  friends: "friends",
};

/**
 * The friend and message buttons from the original web app. "friends" asks
 * before removing; "requested" cancels the request.
 */
export function ProfileActions({
  username,
  relationship,
  isPending,
  onFriendAction,
}: {
  username: string;
  relationship: Relationship | "blocked";
  isPending: boolean;
  /** Sends, accepts, cancels, or removes, depending on the relationship. */
  onFriendAction: (done?: () => void) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  if (relationship === "blocked") return null;
  return (
    <div className="flex w-full flex-col gap-2">
      <Button
        onClick={() => (relationship === "friends" ? setConfirming(true) : onFriendAction())}
        disabled={isPending}
        variant={{ weight: "secondary", color: relationship === "outgoing_pending" ? "foreground" : "accent", size: "sm", width: "full" }}
        className={relationship === "outgoing_pending" ? "border border-dashed border-foreground-tertiary hover:bg-background-secondary" : ""}
      >
        {isPending && !confirming ? "working…" : LABELS[relationship]}
      </Button>
      <Button
        href={`/messages/new/${encodeURIComponent(username)}`}
        variant={{ weight: "secondary", color: "background", size: "sm", width: "full" }}
      >
        <svg aria-hidden xmlns="http://www.w3.org/2000/svg" height="15px" viewBox="0 -960 960 960" width="15px" fill="currentColor">
          <path d="M240-400h320v-80H240v80Zm0-120h480v-80H240v80Zm0-120h480v-80H240v80ZM80-80v-720q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H240L80-80Zm126-240h594v-480H160v525l46-45Zm-46 0v-480 480Z" />
        </svg>
        message
      </Button>
      <RemoveFriendDialog
        open={confirming}
        isPending={isPending}
        username={username}
        onConfirm={() => onFriendAction(() => setConfirming(false))}
        onClose={() => setConfirming(false)}
      />
    </div>
  );
}
