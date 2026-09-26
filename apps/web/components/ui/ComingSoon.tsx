/**
 * Placeholder for WDCC pages whose REST API has not landed yet. It reuses the
 * feed's empty-state styling so navigation stays identical to WDCC.
 */
export function ComingSoon({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 flex flex-col items-center">
      <h1 className="text-4xl font-semibold font-serif tracking-tighter mb-6">
        {title}
      </h1>
      <div className="grid w-full h-full place-items-center py-48 text-center">
        <p className="text-lg text-foreground-secondary font-serif tracking-tight font-medium">
          {message}
        </p>
      </div>
    </div>
  );
}
