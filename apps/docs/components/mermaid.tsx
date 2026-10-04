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

      const dark = resolvedTheme === 'dark';
      // Light colours match apps/mobile/lib/app/theme.dart.
      const colours = {
        accent: '#A684FF',
        surface: dark ? '#30233D' : '#F3E8FF',
        text: dark ? '#F3F1F1' : '#2B2422',
        line: dark ? '#C4B5FD' : '#6E11B0',
        secondary: dark ? '#292524' : '#F3F1F1',
        background: dark ? '#1C1917' : '#FBFAF9',
      };

      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        suppressErrorRendering: true,
        theme: 'base',
        themeVariables: {
          darkMode: dark,
          background: colours.background,
          primaryColor: colours.surface,
          primaryTextColor: colours.text,
          primaryBorderColor: colours.accent,
          secondaryColor: colours.secondary,
          secondaryTextColor: colours.text,
          tertiaryColor: colours.surface,
          tertiaryTextColor: colours.text,
          lineColor: colours.line,
          textColor: colours.text,
          actorBkg: colours.surface,
          actorBorder: colours.accent,
          actorTextColor: colours.text,
          actorLineColor: colours.line,
          signalColor: colours.line,
          signalTextColor: colours.text,
          labelBoxBkgColor: colours.secondary,
          labelBoxBorderColor: colours.accent,
          labelTextColor: colours.text,
          loopTextColor: colours.text,
          noteBkgColor: colours.surface,
          noteBorderColor: colours.accent,
          noteTextColor: colours.text,
          activationBkgColor: colours.secondary,
          activationBorderColor: colours.accent,
          edgeLabelBackground: colours.background,
          clusterBkg: colours.secondary,
          clusterBorder: colours.accent,
        },
        fontFamily: 'inherit',
        htmlLabels: false,
        themeCSS: `
          .edgeLabel rect {
            fill: var(--color-fd-background) !important;
            opacity: 1 !important;
            fill-opacity: 1 !important;
          }
        `,
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
      className="my-6 min-w-0 max-w-full overflow-x-auto [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
    >
      {result.svg ? (
        <div dangerouslySetInnerHTML={{ __html: result.svg }} />
      ) : (
        <p role="status">Loading diagram...</p>
      )}
    </div>
  );
}
