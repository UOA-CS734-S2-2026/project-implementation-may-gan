"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/core/Button";
import { useSession } from "@/lib/session/hooks";
import { NavLink } from "./NavLink";

// Friends, profile, messages, and search return with their REST APIs
// (#46, #47, #68); until then the navigation links only to working pages.
export function Navbar() {
  const { user } = useSession();

  const navContent = (
    <div className="p-10 h-full flex flex-col justify-between overflow-y-auto">
      {/* Upper section (logo and links) */}
      <div className="flex flex-col gap-8">
        <div className="transition duration-200 hover:opacity-75">
          <Link href="/">
            <Image
              src={"/dayli-logo.svg"}
              width={138.67}
              height={71}
              alt="Dayli logo"
            />
          </Link>
        </div>
        <div className="relative flex items-center">
          <div className="flex-grow border-t border-foreground/10 border-[1.2px]" />
        </div>
        <div className="flex flex-col gap-3">
          <Button
            href={`/post`}
            variant={{
              weight: "secondary",
              size: "lg",
              color: "accent",
              typeface: "serif",
              width: "full",
            }}
            className="justify-start"
          >
            <div className="rotate-[-12deg] fill-foreground-accent">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                height="20px"
                viewBox="0 -960 960 960"
                width="20px"
              >
                <path d="M160-80q-33 0-56.5-23.5T80-160v-480q0-33 23.5-56.5T160-720h160l160-160 160 160h160q33 0 56.5 23.5T880-640v480q0 33-23.5 56.5T800-80H160Zm0-80h640v-480H160v480Zm80-80h480L570-440 450-280l-90-120-120 160Zm502.5-217.5Q760-475 760-500t-17.5-42.5Q725-560 700-560t-42.5 17.5Q640-525 640-500t17.5 42.5Q675-440 700-440t42.5-17.5ZM404-720h152l-76-76-76 76ZM160-160v-480 480Z" />
              </svg>
            </div>
            new dayli
          </Button>
        </div>

        <div className="relative flex items-center">
          <div className="flex-grow border-t border-foreground/10 border-[1.2px]" />
          <span className="mx-3 font-serif font-semibold text-sm text-foreground-tertiary">
            pages
          </span>
          <div className="flex-grow border-t border-foreground/10 border-[1.2px]" />
        </div>

        {/* Mid section for links */}
        <div className="">
          <ul className="flex flex-col gap-2 text-[2.3rem] font-serif font-normal tracking-tight text-foreground-secondary">
            <NavLink href={`/home`}>
              <div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  height="30px"
                  viewBox="0 -960 960 960"
                  width="30px"
                >
                  <path d="m305-704 112-145q12-16 28.5-23.5T480-880q18 0 34.5 7.5T543-849l112 145 170 57q26 8 41 29.5t15 47.5q0 12-3.5 24T866-523L756-367l4 164q1 35-23 59t-56 24q-2 0-22-3l-179-50-179 50q-5 2-11 2.5t-11 .5q-32 0-56-24t-23-59l4-165L95-523q-8-11-11.5-23T80-570q0-25 14.5-46.5T135-647l170-57Zm49 69-194 64 124 179-4 191 200-55 200 56-4-192 124-177-194-66-126-165-126 165Zm126 135Z" />
                </svg>
              </div>
              daylies
            </NavLink>
          </ul>
        </div>
      </div>

      {/* Lower section (profile) */}
      {user && (
        <div className="flex flex-col gap-4">
          <Link
            href="/settings"
            className="group transition hover:text-foreground/80 text-muted-foreground flex gap-4 items-center duration-400 hover:duration-200 hover:-translate-y-1"
          >
            {user.image ? (
              <Image
                src={user.image}
                alt={user.name || "Profile"}
                width={48}
                height={48}
                unoptimized
                className="h-12 w-12 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="h-12 w-12 shrink-0 rounded-full bg-background-accent" />
            )}

            <div className="flex flex-col">
              <span className="font-semibold leading-none text-foreground font-serif text-lg tracking-tight group-hover:text-foreground-accent">
                {user.name}
              </span>
              <span className="text-xs text-muted-foreground leading-none mt-1 text-foreground-tertiary">
                settings
              </span>
            </div>
          </Link>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Navigation */}
      <nav className="hidden md:block h-screen w-[300px] bg-background z-10 shadow-nav shrink-0">
        {navContent}
      </nav>

      {/* Mobile Navigation Toggle */}
      <div className="md:hidden">
        <input type="checkbox" id="mobile-nav-toggle" className="peer hidden" />

        {/* Floating Menu Button */}
        <label
          htmlFor="mobile-nav-toggle"
          className="fixed top-6 left-6 z-40 p-3 bg-background border border-foreground/10 rounded-full shadow-md cursor-pointer peer-checked:hidden text-foreground hover:bg-foreground/5 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            height="24px"
            viewBox="0 -960 960 960"
            width="24px"
            fill="currentColor"
          >
            <path d="M120-240v-80h720v80H120Zm0-200v-80h720v80H120Zm0-200v-80h720v80H120Z" />
          </svg>
        </label>

        {/* Full Screen Overlay */}
        <div className="fixed inset-0 z-50 hidden peer-checked:block bg-background h-screen w-screen overflow-hidden">
          {/* Close Button in the same position */}
          <label
            htmlFor="mobile-nav-toggle"
            className="absolute top-6 left-6 z-50 p-3 bg-background border border-foreground/10 rounded-full shadow-md cursor-pointer text-foreground hover:bg-foreground/5 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="24px"
              viewBox="0 -960 960 960"
              width="24px"
              fill="currentColor"
            >
              <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z" />
            </svg>
          </label>

          <nav className="h-full w-full flex flex-col">
            <div className="h-18 shrink-0" />
            <div className="flex-1 overflow-hidden">{navContent}</div>
          </nav>
        </div>
      </div>
    </>
  );
}
