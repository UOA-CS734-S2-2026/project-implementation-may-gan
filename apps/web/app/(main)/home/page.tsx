import { PostCard } from "@/components/ui/PostCard";

export const dynamic = "force-dynamic";

interface FeedPost {
  id: string;
  author: {
    username: string;
    displayUsername: string | null;
    name: string;
    image: string | null;
  };
  promptResponse: string;
  media: { url: string }[];
  createdAt: Date;
}

// The released friends feed arrives with #19 (and #46 for friendships); until
// then the feed is empty and home shows WDCC's empty state.
async function getFeed(): Promise<FeedPost[]> {
  return [];
}

export default async function Home() {
  const posts = await getFeed();

  const EMPTY_MESSAGES = [
    "No daylies from your friends yesterday... maybe today's the comeback?",
    "Nobody posted anything yesterday... how about today?",
    "There was radio silence yesterday... maybe we'll get some daylies today?",
    "The archive is looking a bit thin for yesterday. There's always today.",
    "Yesterday's daylies are looking a little light. Maybe everyone was busy?",
    "Silence is golden, but a dayli is better. Let's write today.",
    "Well, nothing yesterday. The bar for today's dayli is on the floor - it's on you!",
    "No posts from yesterday. How boring...",
    "An empty feed. Did you know you can add new friends by searching for their username?",
    "A day without a dayli is just... a day. Hopefully today's a bit better.",
    "Yesterday's pages are blank. Let's write today's chapter.",
    "Yesterday was just you, me, and the void between us.",
    "A quiet yesterday just leaves space for a big today :)",
    "Nobody posted yesterday. Find better friends ong fr.",
    "Your friends didn't post any daylies yesterday. Are they hiding something from you?",
    "Your friends were being nonchalant yesterday. There's always today!",
  ] as const;

  const randomEmptyMessage =
    // eslint-disable-next-line react-hooks/purity
    EMPTY_MESSAGES[Math.floor(Math.random() * EMPTY_MESSAGES.length)];

  return (
    <section className="flex-1 w-full max-w-6xl mx-auto px-4 md:px-6 py-12">
      {posts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3  gap-6">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              postId={post.id}
              username={post.author.username}
              displayName={post.author.displayUsername || post.author.name}
              userImage={post.author.image}
              promptResponse={post.promptResponse}
              mediaUrl={post.media[0]?.url}
              createdAt={post.createdAt}
            />
          ))}
        </div>
      ) : (
        <div className="grid w-full h-full place-items-center py-64 text-center">
          <p className="text-lg text-foreground-secondary font-serif tracking-tight font-medium">
            {randomEmptyMessage}
          </p>
        </div>
      )}
    </section>
  );
}
