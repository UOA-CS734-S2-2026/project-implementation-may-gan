import { Feed } from "@/features/feed/list-feed/Feed";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <section className="flex-1 w-full max-w-6xl mx-auto px-4 md:px-6 py-12">
      <Feed />
    </section>
  );
}
