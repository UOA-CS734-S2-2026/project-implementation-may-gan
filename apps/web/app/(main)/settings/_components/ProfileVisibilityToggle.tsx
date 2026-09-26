"use client";

import { useState } from "react";

type Visibility = "public" | "private";

export function ProfileVisibilityToggle({
  initialVisibility,
}: {
  initialVisibility: Visibility;
}) {
  const [visibility, setVisibility] = useState<Visibility>(initialVisibility);
  // Profile visibility is saved by the profile API (#68). Until it lands the
  // switch is shown disabled rather than pretending to save.
  const mutation = { isPending: true, mutate: (input: { profileVisibility: Visibility }) => void input };

  const isPrivate = visibility === "private";

  const handleToggle = () => {
    const next: Visibility = isPrivate ? "public" : "private";
    setVisibility(next);
    mutation.mutate({ profileVisibility: next });
  };

  return (
    <div className="flex items-center justify-between rounded-lg border border-foreground/10 p-4">
      <div className="flex flex-col">
        <span className="text-sm font-medium">Private profile</span>
        <span className="text-xs text-foreground/60">
          {isPrivate
            ? "Only you and your friends can see your profile"
            : "Anyone can see your profile"}
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={isPrivate}
        onClick={handleToggle}
        disabled={mutation.isPending}
        className={`relative h-6 w-11 shrink-0 rounded-full transition duration-200 disabled:opacity-60 ${
          isPrivate ? "bg-foreground-accent" : "bg-foreground/20"
        } hover:opacity-75 hover:cursor-pointer`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            isPrivate ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
