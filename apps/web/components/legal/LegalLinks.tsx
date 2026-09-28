import Link from "next/link";

type LegalLinksProps = {
  className?: string;
};

export function LegalLinks({ className = "" }: LegalLinksProps) {
  return (
    <nav aria-label="Legal documents" className={className}>
      <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground-accent">
        Privacy Policy
      </Link>
      <span aria-hidden="true"> · </span>
      <Link href="/terms" className="underline underline-offset-2 hover:text-foreground-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground-accent">
        Terms of Service
      </Link>
    </nav>
  );
}

export function LegalDraftNotice() {
  return (
    <p className="text-xs leading-5 text-foreground-secondary">
      The linked policies are drafts for review. They are not approved terms or privacy notices.
    </p>
  );
}
