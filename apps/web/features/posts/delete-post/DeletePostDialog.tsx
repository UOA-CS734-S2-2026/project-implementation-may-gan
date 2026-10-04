"use client";

import { createPortal } from "react-dom";
import { Button } from "@/components/ui/core/Button";

/** Asks before deleting a post, and says whether today's dayli can be posted again. */
export function DeletePostDialog({
  open,
  isPending,
  error,
  isToday,
  onConfirm,
  onClose,
}: {
  open: boolean;
  isPending: boolean;
  error?: string;
  isToday: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
      // Stay open while deleting, so a failure is still shown.
      onClick={() => {
        if (!isPending) onClose();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-post-title"
        aria-describedby="delete-post-description"
        className="w-full max-w-sm rounded-lg bg-background p-6 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="delete-post-title" className="mb-2 text-base font-semibold">Move this dayli to Trash?</h2>
        <p id="delete-post-description" className="mb-4 text-sm text-foreground-secondary">
          {isToday
            ? "It disappears straight away. You can restore it for 7 days, unless you post a replacement before midnight. Permanent cleanup starts after 14 days."
            : "It disappears straight away. You can restore it for 7 days. Permanent cleanup starts after 14 days."}
        </p>
        {error && <p role="alert" className="mb-4 text-sm text-red-500">{error}</p>}
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
            {isPending ? "Moving..." : "Move to Trash"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
