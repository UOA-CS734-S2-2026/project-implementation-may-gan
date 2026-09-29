import Link from "next/link";
import type { MessagingConversation } from "../shared/messaging.api";

export function formatConversationDate(conversation: MessagingConversation): string | null {
  const value = conversation.latestMessage?.createdAt ?? conversation.updatedAt;
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

type Props = {
  conversations: MessagingConversation[];
  folder: "inbox" | "requests";
  resolvingId: string | null;
  onResolve: (conversationId: string, decision: "accept" | "decline") => void;
};

/** A deliberately small WDCC-style conversation row. Avatars are initials until a public image field exists. */
export function ConversationList({ conversations, folder, resolvingId, onResolve }: Props) {
  if (conversations.length === 0) return <div className="py-16 text-center"><p className="font-serif text-2xl">No {folder === "requests" ? "requests" : "conversations"} yet.</p></div>;
  return <ul className="space-y-1" aria-label={folder === "requests" ? "Message requests" : "Messages"}>{conversations.map((conversation) => <ConversationRow key={conversation.id} conversation={conversation} folder={folder} resolving={resolvingId === conversation.id} onResolve={onResolve} />)}</ul>;
}

function ConversationRow({ conversation, folder, resolving, onResolve }: { conversation: MessagingConversation; folder: "inbox" | "requests"; resolving: boolean; onResolve: Props["onResolve"] }) {
  const name = conversation.peer.name?.trim() || "conversation";
  const initial = name.slice(0, 1).toLocaleUpperCase() || "?";
  const date = formatConversationDate(conversation);
  const canResolve = folder === "requests" && conversation.capabilities.canResolveRequest;
  return <li className="rounded-lg px-3 py-3 hover:bg-background-secondary/60">
    <div className="flex items-center gap-3">
      <Link href={`/messages/${conversation.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent">
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-background-accent font-serif text-sm text-foreground-accent">{initial}</span>
        <span className="min-w-0 flex-1"><span className="flex items-baseline justify-between gap-2"><strong className="truncate font-sans text-sm font-medium">{name}</strong>{date && <time dateTime={conversation.latestMessage?.createdAt ?? conversation.updatedAt} className={`shrink-0 font-sans text-xs text-foreground-secondary ${canResolve ? "hidden sm:block" : ""}`}>{date}</time>}</span><span className="mt-0.5 block truncate font-sans text-xs text-foreground-secondary">{conversation.latestMessage?.text ?? "No messages yet"}</span></span>
      </Link>
      {conversation.unreadCount > 0 && <span aria-label={`${conversation.unreadCount} unread messages`} className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-foreground-accent px-1.5 font-sans text-[11px] font-semibold text-white">{conversation.unreadCount}</span>}
    </div>
    {canResolve && <div className="mt-2 flex justify-end gap-2"><button type="button" disabled={resolving} onClick={() => onResolve(conversation.id, "accept")} className="rounded-lg bg-background-accent px-3 py-2 font-sans text-xs font-medium text-foreground-accent disabled:opacity-50">Accept</button><button type="button" disabled={resolving} onClick={() => onResolve(conversation.id, "decline")} className="rounded-lg border border-foreground/15 px-3 py-2 font-sans text-xs font-medium text-foreground-secondary disabled:opacity-50">Decline</button></div>}
  </li>;
}
