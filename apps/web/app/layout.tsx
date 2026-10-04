import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Epilogue, Spectral } from "next/font/google";
import { Toaster } from "sonner";
import { SessionProvider } from "@/lib/session/provider";
import { ThemeProvider } from "@/lib/theme/provider";
import "./globals.css";

const epilogue = Epilogue({
  variable: "--font-epilogue",
  subsets: ["latin"],
  weight: ["300", "500", "700"],
});

const spectral = Spectral({
  variable: "--font-spectral",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
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
