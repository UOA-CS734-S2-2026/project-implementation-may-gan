# Bundled web fonts

These normal-style Latin WOFF2 files come from `@fontsource/epilogue@5.3.0` and `@fontsource/spectral@5.3.0`. Their upstream licenses are included alongside them.

The layout uses `next/font/local` with the same font families, requested weights and CSS variables. Bundling these files removes build-time Google Fonts downloads, including URLs without a file extension that caused the hosted Next.js font loader to fail.
