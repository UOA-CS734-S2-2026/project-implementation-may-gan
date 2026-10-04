import { DeletionPanel } from "./DeletionPanel";

/** Kept outside the username gate so a pending owner can still cancel. */
export default function AccountDeletionPage() {
  const requestEnabled = process.env.NEXT_PUBLIC_STAGING_ACCOUNT_DELETION_APPROVED === "request-deletion-staging"
    && process.env.NEXT_PUBLIC_WEB_API_PROXY_ENABLED === "true"
    && process.env.NEXT_PUBLIC_WEB_API_BASE_URL === "https://staging.dayli.agroupforcoders.com";
  return <main className="mx-auto max-w-xl space-y-6 px-6 py-16">
    <h1 className="text-2xl font-semibold">Account deletion</h1>
    <DeletionPanel requestEnabled={requestEnabled} />
  </main>;
}
