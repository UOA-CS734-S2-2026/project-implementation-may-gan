import { Suspense } from "react";
import { Navbar } from "./Navbar";
import { MobileNavCloseListener } from "./MobileNavCloseListener";

/** The signed-in frame: the navigation sidebar beside the page. Expects a query client and messaging context above it. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex w-full bg-background">
      <div className="fixed flex-none z-10">
        <Navbar />
      </div>
      <div className="relative w-full flex-1 pt-20 md:pl-[300px] md:pt-0">
        <div className="relative z-[1]">{children}</div>
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-[-50%] bg-[url('/dotgridbg.jpg')] bg-[50%] opacity-50"></div>
        </div>
      </div>
      <Suspense fallback={null}>
        <MobileNavCloseListener />
      </Suspense>
    </main>
  );
}
