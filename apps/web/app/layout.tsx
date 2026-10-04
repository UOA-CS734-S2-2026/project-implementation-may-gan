import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import { SessionProvider } from "@/lib/session/provider";
import { ThemeProvider } from "@/lib/theme/provider";
import "./globals.css";

const epilogue = localFont({
  variable: "--font-epilogue",
  src: [
    { path: "../public/fonts/epilogue-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "../public/fonts/epilogue-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/epilogue-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
});

const spectral = localFont({
  variable: "--font-spectral",
  src: [
    { path: "../public/fonts/spectral-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "../public/fonts/spectral-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/spectral-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/spectral-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../public/fonts/spectral-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dayli",
  description: "A daily reflection app for sharing the days that matter with friends",
  referrer: "no-referrer",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      data-theme="default"
      className={`${epilogue.variable} ${spectral.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SessionProvider>
          <ThemeProvider>
            {children}
            <Toaster />
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
