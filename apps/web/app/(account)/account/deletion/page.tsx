import { DeletionPanel } from "./DeletionPanel";

/** Kept outside the username gate so a pending owner can still cancel. */
export default function AccountDeletionPage() {
  // The client remains read and cancel only until server-side realtime
  // revocation has durable retry and reconciliation, not just a one-shot call.
  const requestEnabled = false;
  return <main className="mx-auto max-w-xl space-y-6 px-6 py-16">
    <h1 className="text-2xl font-semibold">Account deletion</h1>
    <DeletionPanel requestEnabled={requestEnabled} />
  </main>;
}
