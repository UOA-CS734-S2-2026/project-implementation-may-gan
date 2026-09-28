import Link from "next/link";
import type { LegalDocument as LegalDocumentData } from "@dayli/legal-content";
import { LegalLinks } from "./LegalLinks";

export function LegalDocument({ document }: { document: LegalDocumentData }) {
  const isDraft = document.status !== "approved";

  return (
    <article className="legal-document mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-16">
      <header className="border-b border-foreground/15 pb-8">
        <p className="font-sans text-xs font-medium uppercase tracking-[0.16em] text-foreground-secondary">Dayli legal</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">{document.title}</h1>
        {isDraft ? (
          <div role="status" className="mt-6 rounded-xl border border-foreground-accent/25 bg-background-accent px-4 py-3 text-sm leading-6 text-foreground-accent">
            <strong>Draft, not approved for publication.</strong> This document has no effective date and is awaiting operator and legal review.
          </div>
        ) : (
          <p className="mt-4 text-sm text-foreground-secondary">Effective {document.effectiveDate}</p>
        )}
        <p className="mt-5 max-w-2xl font-serif text-lg leading-8 text-foreground-secondary">{document.summary}</p>
        <p className="mt-4 text-xs text-foreground-tertiary">Version: {document.version}</p>
      </header>

      <nav aria-label={`${document.title} sections`} className="my-8 rounded-xl bg-background-secondary p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-foreground-secondary">On this page</p>
        <ol className="grid gap-2 sm:grid-cols-2">
          {document.sections.map((section) => (
            <li key={section.id}>
              <a className="text-sm underline underline-offset-2 hover:text-foreground-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground-accent" href={`#${section.id}`}>
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="space-y-10">
        {document.sections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-8" aria-labelledby={`${section.id}-heading`}>
            <h2 id={`${section.id}-heading`} className="font-serif text-2xl font-semibold tracking-tight">{section.title}</h2>
            <div className="mt-3 space-y-4 text-[1.02rem] leading-8 text-foreground-secondary">
              {section.blocks.map((block, index) => {
                if (block.type === "paragraph") return <p key={index}>{block.text}</p>;
                if (block.type === "list") return <ul key={index} className="list-disc space-y-2 pl-6">{block.items.map((item) => <li key={item}>{item}</li>)}</ul>;
                return <p key={index}><Link href={block.href} className="font-medium text-foreground-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground-accent">{block.label}</Link></p>;
              })}
            </div>
          </section>
        ))}
      </div>

      <footer className="mt-12 border-t border-foreground/15 pt-6">
        <LegalLinks className="text-sm text-foreground-secondary" />
      </footer>
    </article>
  );
}
