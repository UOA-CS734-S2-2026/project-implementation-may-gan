'use client';

import Script from 'next/script';
import { useRef } from 'react';

declare global {
  interface Window {
    Scalar?: {
      createApiReference: (
        element: HTMLElement,
        configuration: { url: string },
      ) => void;
    };
  }
}

export function ApiReference() {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  function initializeReference() {
    if (initialized.current || !containerRef.current || !window.Scalar) return;

    initialized.current = true;
    window.Scalar.createApiReference(containerRef.current, {
      url: '/docs/openapi.json',
    });
  }

  return (
    <>
      <div ref={containerRef} />
      <Script
        src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.72.4"
        strategy="afterInteractive"
        onReady={initializeReference}
      />
    </>
  );
}
