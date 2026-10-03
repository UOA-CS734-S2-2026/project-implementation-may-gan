'use client';

import { useEffect, useId, useState } from 'react';
import { useTheme } from 'next-themes';

// Mermaid has shared configuration, so serialize rendering across diagrams.
let renderQueue: Promise<unknown> = Promise.resolve();

export function Mermaid({ chart }: { chart: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const { resolvedTheme } = useTheme();
  const [result, setResult] = useState<{ svg?: string; error?: boolean }>({});

  useEffect(() => {
    let cancelled = false;
    setResult({});

    const render = renderQueue.then(async () => {
      const { default: mermaid } = await import('mermaid');
      if (cancelled) return;

      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        suppressErrorRendering: true,
        theme: resolvedTheme === 'dark' ? 'dark' : 'default',
        fontFamily: 'inherit',
      });

      const { svg } = await mermaid.render(`mermaid${id}`, chart);
      if (!cancelled) setResult({ svg });
    });

    renderQueue = render.catch(() => {
      if (!cancelled) setResult({ error: true });
    });

    return () => {
      cancelled = true;
    };
  }, [chart, id, resolvedTheme]);

  if (result.error) {
    return (
      <div role="alert">
        <p>Could not render this diagram. Here is its source:</p>
        <pre className="overflow-x-auto"><code>{chart}</code></pre>
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label="Mermaid diagram"
      aria-busy={!result.svg}
      className="my-6 overflow-x-auto [&_svg]:mx-auto"
    >
      {result.svg ? (
        <div dangerouslySetInnerHTML={{ __html: result.svg }} />
      ) : (
        <p role="status">Loading diagram...</p>
      )}
    </div>
  );
}
