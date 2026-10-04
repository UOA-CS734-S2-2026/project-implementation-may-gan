import { ExportPanel } from "./ExportPanel";

/** Independent of the ordinary-app username gate, so eligible restricted owners can export. */
export default function AccountExportPage() {
  return <main className="mx-auto max-w-xl space-y-6 px-6 py-16">
    <h1 className="text-2xl font-semibold">Your data export</h1>
    <ExportPanel enabled={false} />
  </main>;
}
