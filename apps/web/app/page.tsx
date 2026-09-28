"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useSession } from "@/lib/session/hooks";
import { LegalDraftNotice, LegalLinks } from "@/components/legal/LegalLinks";

import GallerySquiggle1 from "@/assets/GallerySquiggle01";
import GallerySquiggle2 from "@/assets/GallerySquiggle02";
import GallerySquiggle3 from "@/assets/GallerySquiggle03";

export default function App() {
  const router = useRouter();
  const { user } = useSession();

  // Signed-in users go straight to their dashboard. The session lives on the
  // API origin, so the check runs in the browser rather than on the server.
  useEffect(() => {
    if (user) router.replace("/home");
  }, [router, user]);

  return (
    <main className="overflow-hidden relative min-h-screen">
      <div className="grid place-items-center h-screen text-center relative z-20">
        <div>
          <div className="relative flex flex-col gap-6 justify-center items-center max-w-[350px]">
            <div className="w-[250px]">
              <Image
                src={"/dayli-logo.svg"}
                width={138.67}
                height={71}
                alt="Dayli logo"
                className="h-full w-full"
              />
            </div>
            <h1 className="font-serif text-xl font-medium tracking-tight leading-tight">
              is a daily reflective social media app, for friend groups big and
              small
            </h1>
            <div className="flex gap-4 font-serif tracking-tighter ">
              <Link
                href="/sign-up"
                className="px-6 py-1.5 bg-background-accent text-foreground-accent rounded-lg font-semibold hover:opacity-80 transition-opacity"
              >
                Sign up →
              </Link>
              <Link
                href="/sign-in"
                className="px-4 py-1.5 bg-background-tertiary text-foreground rounded-lg font-semibold hover:opacity-80 transition-opacity"
              >
                Sign in
              </Link>
            </div>
            <div className="absolute top-[90px] left-[105px] stroke-[4px] stroke-accent rotate-[-10deg] opacity-20">
              <GallerySquiggle2 />
            </div>
          </div>
        </div>

        <p className="absolute top-6 text-xs opacity-50">
          Dayli by Team WDCC | COMPSCI 732
        </p>
        <div className="absolute bottom-4 z-30 flex max-w-[calc(100%-2rem)] flex-col items-center gap-1 text-center">
          <p className="text-lg font-medium opacity-50">one post, every day.</p>
          <LegalLinks className="text-xs text-foreground-secondary" />
          <LegalDraftNotice />
        </div>
      </div>

      {/* Decorative images and assets etc */}
      <Decor />

      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-[-50%] bg-[url('/dotgridbg.jpg')] bg-[40%] opacity-50 rotate-3"></div>
      </div>
    </main>
  );
}

{
  /* Decorative images and assets etc */
}

function Decor() {
  return (
    <div className="absolute w-full h-full top-0 overflow-hidden pointer-events-none z-10">
      <div className="absolute left-[50px] top-[70px] stroke-[4px] stroke-purple-300 rotate-[-10deg] z-[15]">
        <GallerySquiggle1 />
      </div>
      <div className="absolute bottom-[250px] right-[70px] stroke-[4px] stroke-purple-300 rotate-[-20deg] z-[15]">
        <GallerySquiggle3 />
      </div>
      <Image
        src={"/landing/img1.png"}
        alt={"A decorative image"}
        width={100}
        height={200}
        className="absolute h-[250px] w-auto bottom-[200px] left-[-50px] z-[12]"
      />
      <Image
        src={"/landing/img2.png"}
        alt={"A decorative image"}
        width={100}
        height={200}
        className="absolute h-[250px] w-auto bottom-[20px] right-[50px] z-[11]"
      />
      <Image
        src={"/landing/img3.png"}
        alt={"A decorative image"}
        width={100}
        height={200}
        className="absolute h-[250px] w-auto bottom-[-50px] right-[180px]"
      />
      <Image
        src={"/landing/img4.png"}
        alt={"A decorative image"}
        width={100}
        height={200}
        className="absolute h-[250px] w-auto top-[-10px] left-[-10px] rotate-[20deg]"
      />
      <Image
        src={"/landing/grid1.jpg"}
        alt={"A decorative image"}
        width={200}
        height={400}
        className="absolute h-[400px] w-auto top-[-70px] right-[200px] z-[12] rotate-12"
      />
      <Image
        src={"/landing/grid2.jpg"}
        alt={"A decorative image"}
        width={200}
        height={400}
        className="absolute h-[400px] w-auto top-[-180px] left-[300px] z-[11] rotate-[-10deg]"
      />
      <Image
        src={"/landing/grid3.jpg"}
        alt={"A decorative image"}
        width={200}
        height={400}
        className="absolute h-[400px] w-auto bottom-[300px] right-[-120px] rotate-[-15deg]"
      />
      <Image
        src={"/landing/grid4.jpg"}
        alt={"A decorative image"}
        width={200}
        height={400}
        className="absolute h-[400px] w-auto bottom-[-80px] left-[70px] rotate-[10deg]"
      />
    </div>
  );
}
