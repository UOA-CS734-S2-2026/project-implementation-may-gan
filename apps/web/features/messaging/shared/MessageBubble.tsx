"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { MessagingMessage, Reaction } from "./messaging.api";

const reactions: Array<{ key: Reaction; emoji: string; label: string }> = [
  { key: "love", emoji: "❤️", label: "Love" },
  { key: "laugh", emoji: "😂", label: "Laugh" },
  { key: "surprised", emoji: "😮", label: "Surprised" },
  { key: "sad", emoji: "😢", label: "Sad" },
  { key: "angry", emoji: "😡", label: "Angry" },
  { key: "like", emoji: "👍", label: "Like" },
];
const fullReactions = [...reactions, { key: "thanks" as Reaction, emoji: "🙏", label: "Thanks" }];
const reactionByKey = new Map(fullReactions.map((reaction) => [reaction.key, reaction]));

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function copyMessage(text: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const input = document.createElement("textarea");
  input.value = text;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  document.execCommand("copy");
  input.remove();
  return Promise.resolve();
}

export function MessageBubble({ message, own, canInteract, canUnsend, canEdit, receiptSequence, onReply, onEdit, onUnsend, onReaction, onHeart }: {
  message: MessagingMessage;
  own: boolean;
  canInteract: boolean;
  canUnsend: boolean;
  canEdit: boolean;
  receiptSequence: string;
  onReply(message: MessagingMessage): void;
  onEdit(message: MessagingMessage): void;
  onUnsend(message: MessagingMessage): void;
  onReaction(message: MessagingMessage, reaction: Reaction): void;
  onHeart(message: MessagingMessage): void;
}) {
  const [quickOpen, setQuickOpen] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [badgeOpen, setBadgeOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [heartPop, setHeartPop] = useState(false);
  const holdTimer = useRef<number | null>(null);
  const unsent = Boolean(message.unsentAt);
  const editOpen = own && !unsent && canEdit;
  const receiptVisible = own && BigInt(receiptSequence || "0") >= BigInt(message.sequence);
  const hasOwnReaction = message.reactions.some((reaction) => reaction.reactedByActor);

  useEffect(() => () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
  }, []);

  useEffect(() => {
    const cancel = () => {
      if (holdTimer.current !== null) {
        window.clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }
    };
    window.addEventListener("scroll", cancel, true);
    return () => window.removeEventListener("scroll", cancel, true);
  }, []);

  function closePickers() {
    setQuickOpen(false);
    setFullOpen(false);
    setMenuOpen(false);
  }

  function chooseReaction(reaction: Reaction) {
    onReaction(message, reaction);
    closePickers();
    setMobileOpen(false);
  }

  function startHold(event: PointerEvent<HTMLElement>) {
    if (event.pointerType !== "touch" || unsent || !canInteract) return;
    holdTimer.current = window.setTimeout(() => {
      setMobileOpen(true);
      navigator.vibrate?.(10);
    }, 500);
  }

  function cancelHold() {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }

  function addHeart() {
    onHeart(message);
    setHeartPop(true);
    window.setTimeout(() => setHeartPop(false), 220);
  }

  const actionItems = <>
    {!unsent && canInteract && <button type="button" onClick={() => { onReply(message); closePickers(); setMobileOpen(false); }}>Reply</button>}
    {!unsent && <button type="button" onClick={() => { void copyMessage(message.text ?? ""); closePickers(); setMobileOpen(false); }}>Copy</button>}
    {editOpen && canInteract && <button type="button" onClick={() => { onEdit(message); closePickers(); setMobileOpen(false); }}>Edit</button>}
    {own && !unsent && canUnsend && <button type="button" onClick={() => { onUnsend(message); closePickers(); setMobileOpen(false); }} className="text-red-600">Unsend</button>}
  </>;

  return (
    <article
      data-testid={`message-${message.id}`}
      className={`message-shell group/message relative flex w-full ${own ? "justify-end" : "justify-start"}`}
      onPointerDown={startHold}
      onPointerMove={cancelHold}
      onPointerUp={cancelHold}
      onPointerCancel={cancelHold}
      onScrollCapture={cancelHold}
      onDoubleClick={unsent || !canInteract ? undefined : addHeart}
    >
      <div data-message-content className={`relative w-fit max-w-[84%] ${own ? "message-own" : "message-received"}`}>
        <div className={`relative rounded-2xl px-4 py-3 font-sans text-sm ${own ? "bg-foreground-accent text-white" : "bg-background-secondary text-foreground"}`}>
          {message.replyPreview && <p className="mb-2 border-l-2 border-current/35 pl-2 text-xs opacity-75">Replying to: {message.replyPreview.text ?? "Message removed"}</p>}
          <p className={unsent ? "italic opacity-70" : "whitespace-pre-wrap"}>{message.text ?? "This message was unsent."}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs opacity-70">
            {message.editedAt && <span>edited</span>}{receiptVisible && <span aria-label="Read receipt">read</span>}
          </div>
        </div>

        {!unsent && message.reactions.length > 0 && <div className={`absolute -bottom-3 flex max-w-full gap-1 overflow-x-auto px-1 message-reaction-badge ${badgeOpen ? "z-30" : "z-[1]"}`}>
          <button type="button" aria-label="View reactions" aria-expanded={badgeOpen} onClick={() => { setBadgeOpen((open) => !open); closePickers(); }} className={`message-press flex min-h-6 items-center gap-1 rounded-full border bg-background px-2 text-xs shadow-sm ${hasOwnReaction ? "border-foreground-accent/40 bg-background-accent" : "border-foreground/10"}`}>
            {message.reactions.map((summary) => {
              const reaction = reactionByKey.get(summary.reaction);
              return <span key={summary.reaction}>{reaction?.emoji ?? summary.reaction}{summary.count > 1 ? ` ${summary.count}` : ""}</span>;
            })}
          </button>
          {badgeOpen && <div role="dialog" aria-label="Reaction details" className="message-popover fixed inset-x-4 bottom-5 z-50 mx-auto w-56 rounded-xl border border-foreground/10 bg-background p-3 text-foreground shadow-card">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-secondary">Reacted by</p>
            <ul className="space-y-1 text-sm">
              {message.reactions.flatMap((summary) => (summary.reactors?.length ? summary.reactors.map((actor) => <li key={`${summary.reaction}-${actor.id}`}>{reactionByKey.get(summary.reaction)?.emoji} {actor.id === "me" ? "You" : actor.name}</li>) : [<li key={summary.reaction}>{reactionByKey.get(summary.reaction)?.emoji} {summary.count === 1 ? (summary.reactedByActor ? "You" : "1 person") : `${summary.count} people`}</li>]))}
            </ul>
            {hasOwnReaction && canInteract && <button type="button" onClick={() => { const ownReaction = message.reactions.find((reaction) => reaction.reactedByActor); if (ownReaction) chooseReaction(ownReaction.reaction); }} className="mt-3 text-sm font-medium text-foreground-accent underline underline-offset-2">Remove your reaction</button>}
          </div>}
        </div>}

        {!unsent && (canInteract || (own && canUnsend)) && <div className={`message-toolbar absolute top-1/2 z-10 -translate-y-1/2 items-center gap-1 rounded-full border border-foreground/10 bg-background p-1 text-foreground shadow-card ${own ? "right-full mr-2" : "left-full ml-2"}`}>
          {canInteract && <div className="relative">
            <button type="button" aria-label="Add reaction" aria-expanded={quickOpen} title="React" onClick={() => { setQuickOpen((open) => !open); setMenuOpen(false); }} className="message-icon-button message-press">☺<span className="message-plus">+</span></button>
            {quickOpen && <div role="group" aria-label="Quick reactions" className={`message-popover absolute top-0 z-20 flex items-center gap-1 rounded-full border border-foreground/10 bg-background p-1 shadow-card ${own ? "right-full mr-2" : "left-full ml-2"}`}>
              {reactions.map((reaction) => <button key={reaction.key} type="button" aria-label={`React ${reaction.label}`} title={reaction.label} onClick={() => chooseReaction(reaction.key)} className="message-press grid h-8 w-8 place-items-center rounded-full text-lg hover:bg-background-secondary">{reaction.emoji}</button>)}
              <button type="button" aria-label="More reactions" title="More reactions" onClick={() => { setFullOpen(true); setQuickOpen(false); }} className="message-press grid h-8 w-8 place-items-center rounded-full text-base hover:bg-background-secondary">+</button>
            </div>}
          </div>}
          {canInteract && <button type="button" aria-label="Reply" title="Reply" onClick={() => onReply(message)} className="message-icon-button message-press">↩</button>}
          <div className="relative">
            <button type="button" aria-label="Message actions" aria-expanded={menuOpen} title="More" onClick={() => { setMenuOpen((open) => !open); setQuickOpen(false); }} className="message-icon-button message-press text-lg leading-none">⋮</button>
            {menuOpen && <div role="menu" aria-label="Message actions" className={`message-popover absolute top-0 z-20 w-48 overflow-hidden rounded-2xl border border-foreground/10 bg-background py-2 text-foreground shadow-card ${own ? "right-full mr-2" : "left-full ml-2"}`}>
              <p className="border-b border-foreground/10 px-4 pb-2 text-sm text-foreground-secondary">{formatTimestamp(message.createdAt)}</p>
              <div className="mt-1 grid [&>button]:px-4 [&>button]:py-2.5 [&>button]:text-left [&>button:hover]:bg-background-secondary">{actionItems}</div>
            </div>}
          </div>
        </div>}

        {heartPop && <span aria-hidden className={`message-heart-pop absolute top-1/2 z-20 -translate-y-1/2 text-4xl ${own ? "right-1/2" : "left-1/2"}`}>❤️</span>}
      </div>

      {fullOpen && <div role="dialog" aria-label="All reactions" className="message-popover fixed inset-x-4 bottom-5 z-30 mx-auto max-w-sm rounded-2xl border border-foreground/10 bg-background p-4 text-foreground shadow-card">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-serif text-lg">Reactions</h2><button type="button" aria-label="Close reactions" onClick={() => setFullOpen(false)} className="message-icon-button">×</button></div>
        <div className="grid grid-cols-4 gap-2">{fullReactions.map((reaction) => <button key={reaction.key} type="button" aria-label={`React ${reaction.label}`} onClick={() => chooseReaction(reaction.key)} className="message-press rounded-xl bg-background-secondary py-3 text-2xl hover:bg-background-accent">{reaction.emoji}<span className="sr-only"> {reaction.label}</span></button>)}</div>
      </div>}

      {mobileOpen && <div role="dialog" aria-label="Message actions" className="fixed inset-x-3 bottom-3 z-30 rounded-2xl border border-foreground/10 bg-background p-3 text-foreground shadow-card md:hidden">
        <div role="group" aria-label="Quick reactions" className="flex justify-between gap-1">{reactions.map((reaction) => <button key={reaction.key} type="button" aria-label={`React ${reaction.label}`} onClick={() => chooseReaction(reaction.key)} className="message-press grid h-10 w-10 place-items-center rounded-full text-xl hover:bg-background-secondary">{reaction.emoji}</button>)}</div>
        <div className="mt-3 grid divide-y divide-foreground/10 [&>button]:py-3 [&>button]:text-left">{actionItems}</div>
        <button type="button" onClick={() => setMobileOpen(false)} className="mt-2 w-full rounded-xl bg-background-secondary py-2 text-sm">Cancel</button>
      </div>}
    </article>
  );
}
