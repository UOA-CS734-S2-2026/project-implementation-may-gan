import { ExportPanel } from "./ExportPanel";

/** Independent of the ordinary-app username gate, so eligible restricted owners can export. */
export default function AccountExportPage() {
  const stagingExportEnabled = process.env.NEXT_PUBLIC_STAGING_EXPORT_APPROVED === "all-staging-accounts" &&
    process.env.NEXT_PUBLIC_WEB_API_PROXY_ENABLED === "true" &&
    process.env.NEXT_PUBLIC_WEB_API_BASE_URL === "https://staging.dayli.agroupforcoders.com";
  return <main className="mx-auto max-w-xl space-y-6 px-6 py-16">
    <h1 className="text-2xl font-semibold">Your data export</h1>
    <ExportPanel enabled={stagingExportEnabled} />
  </main>;
}
