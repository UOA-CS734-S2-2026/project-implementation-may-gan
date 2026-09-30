"use client";

import { createPortal } from "react-dom";
import { Button } from "@/components/ui/core/Button";

/** Asks before removing a friend, as in the original web app. */
export function RemoveFriendDialog({
  open,
  isPending,
  username,
  onConfirm,
  onClose,
}: {
  open: boolean;
  isPending: boolean;
  username: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-friend-title"
        className="w-full max-w-sm rounded-lg bg-background p-6 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="remove-friend-title" className="mb-2 text-base font-semibold">Remove friend</h2>
        <p className="mb-6 text-sm text-foreground-secondary">
          Are you sure you want to remove @{username} from your friends?
        </p>
        <div className="flex justify-end gap-3">
          <Button onClick={onClose} disabled={isPending} variant={{ weight: "secondary", size: "sm", color: "foreground" }}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isPending}
            variant={{ weight: "secondary", size: "sm", color: "foreground" }}
            className="bg-rose-100 text-rose-600 hover:bg-rose-200"
          >
            {isPending ? "Removing..." : "Remove"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
