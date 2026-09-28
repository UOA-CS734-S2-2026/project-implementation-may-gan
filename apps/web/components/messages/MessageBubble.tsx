"use client";

import type { MessagingMessage, Reaction } from "@/lib/api/messaging";

const reactionLabels: Record<Reaction, string> = { like: "Like", love: "Love", laugh: "Laugh", surprised: "Surprised", sad: "Sad", thanks: "Thanks" };

export function MessageBubble({ message, own, canInteract, canEdit, receiptSequence, onReply, onEdit, onUnsend, onReaction }: {
  message: MessagingMessage;
  own: boolean;
  canInteract: boolean;
  canEdit: boolean;
  receiptSequence: string;
  onReply(message: MessagingMessage): void;
  onEdit(message: MessagingMessage): void;
  onUnsend(message: MessagingMessage): void;
  onReaction(message: MessagingMessage, reaction: Reaction): void;
}) {
  const unsent = Boolean(message.unsentAt);
  const editOpen = own && !unsent && canEdit;
  const receiptVisible = own && BigInt(receiptSequence || "0") >= BigInt(message.sequence);
  return (
    <article data-testid={`message-${message.id}`} className={`group max-w-[84%] rounded-2xl px-4 py-3 font-sans text-sm ${own ? "ml-auto bg-foreground-accent text-white" : "bg-background-secondary text-foreground"}`}>
      {message.replyPreview && <p className="mb-2 border-l-2 border-current/35 pl-2 text-xs opacity-75">Replying to: {message.replyPreview.text ?? "Message removed"}</p>}
      <p className={unsent ? "italic opacity-70" : "whitespace-pre-wrap"}>{message.text ?? "This message was unsent."}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs opacity-70">
        {message.editedAt && <span>edited</span>}{receiptVisible && <span aria-label="Read receipt">read</span>}
      </div>
      {!unsent && <div className="mt-2 flex flex-wrap gap-1">{message.reactions.map((summary) => <button key={summary.reaction} type="button" disabled={!canInteract} onClick={() => onReaction(message, summary.reaction)} className={`rounded-full border px-2 py-0.5 text-xs ${summary.reactedByActor ? "border-current bg-white/15" : "border-current/25"}`}>{reactionLabels[summary.reaction]} {summary.count}</button>)}{canInteract && <details className="relative"><summary aria-label="Add reaction" className="cursor-pointer list-none rounded-full border border-current/25 px-2 py-0.5 text-xs">+ reaction</summary><div className="absolute right-0 z-10 mt-1 flex gap-1 rounded-xl border border-foreground/10 bg-background p-1 text-foreground shadow-card">{(Object.keys(reactionLabels) as Reaction[]).map((reaction) => <button key={reaction} type="button" aria-label={`React ${reactionLabels[reaction]}`} onClick={() => onReaction(message, reaction)} className="rounded-lg px-2 py-1 text-xs hover:bg-background-secondary">{reactionLabels[reaction]}</button>)}</div></details>}</div>}
      <div className="mt-3 flex gap-3 text-xs opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {!unsent && canInteract && <button type="button" onClick={() => onReply(message)} className="underline underline-offset-2">reply</button>}
        {editOpen && canInteract && <button type="button" onClick={() => onEdit(message)} className="underline underline-offset-2">edit</button>}
        {own && !unsent && canInteract && <button type="button" onClick={() => onUnsend(message)} className="underline underline-offset-2">unsend</button>}
      </div>
    </article>
  );
}
