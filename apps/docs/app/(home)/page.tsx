import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Dayli Docs',
  description: 'Guides for using, building, operating, and reviewing Dayli.',
};

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="max-w-2xl">
        <p className="mb-3 text-sm font-medium text-fd-muted-foreground">
          Dayli documentation
        </p>
        <h1 className="mb-4 text-4xl font-bold tracking-tight">
          Find your way around Dayli
        </h1>
        <p className="mb-8 text-lg text-fd-muted-foreground">
          Learn how to use the daily reflection app, contribute a change,
          understand its architecture, operate staging, or review the student
          project.
        </p>
        <Link
          href="/docs"
          className="inline-flex rounded-md bg-fd-primary px-5 py-2.5 font-medium text-fd-primary-foreground transition-colors hover:bg-fd-primary/90"
        >
          Choose a quick start
        </Link>
      </div>
    </main>
  );
}
