import Link from "next/link";
import { trpcServer } from "@/lib/trpc/server";
import Image from "next/image";
import { NavSearch } from "./NavSearch";
import { Button } from "@/components/ui/core/Button";
import { NavLink } from "./NavLink";

export async function Navbar() {
  const user = await trpcServer.auth.me().catch(() => null);

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
          {user && <NavSearch />}
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
            {user && (
              <>
                <NavLink href={`/${user.username}/friends`}>
                  <div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      height="30px"
                      viewBox="0 -960 960 960"
                      width="30px"
                    >
                      <path d="M40-160v-112q0-34 17.5-62.5T104-378q62-31 126-46.5T360-440q66 0 130 15.5T616-378q29 15 46.5 43.5T680-272v112H40Zm720 0v-120q0-44-24.5-84.5T666-434q51 6 96 20.5t84 35.5q36 20 55 44.5t19 53.5v120H760ZM247-527q-47-47-47-113t47-113q47-47 113-47t113 47q47 47 47 113t-47 113q-47 47-113 47t-113-47Zm466 0q-47 47-113 47-11 0-28-2.5t-28-5.5q27-32 41.5-71t14.5-81q0-42-14.5-81T544-792q14-5 28-6.5t28-1.5q66 0 113 47t47 113q0 66-47 113ZM120-240h480v-32q0-11-5.5-20T580-306q-54-27-109-40.5T360-360q-56 0-111 13.5T140-306q-9 5-14.5 14t-5.5 20v32Zm296.5-343.5Q440-607 440-640t-23.5-56.5Q393-720 360-720t-56.5 23.5Q280-673 280-640t23.5 56.5Q327-560 360-560t56.5-23.5ZM360-240Zm0-400Z" />
                    </svg>
                  </div>
                  friends
                </NavLink>
                <NavLink href={`/${user.username}`} exact>
                  <div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      height="30px"
                      viewBox="0 -960 960 960"
                      width="30px"
                    >
                      <path d="M508-200h224q-7 26-24 42t-44 20L228-85q-33 5-59.5-15.5T138-154L85-591q-4-33 16-59t53-30l46-6v80l-36 5 54 437 290-36Zm-148-80q-33 0-56.5-23.5T280-360v-440q0-33 23.5-56.5T360-880h440q33 0 56.5 23.5T880-800v440q0 33-23.5 56.5T800-280H360Zm0-80h440v-440H360v440Zm220-220ZM218-164Zm363-236q68 0 115.5-47T749-560q-68 0-116.5 47T581-400Zm0 0q-3-66-51.5-113T413-560q5 66 52.5 113T581-400Zm0-120q17 0 28.5-11.5T621-560v-10l10 4q15 6 30.5 3t23.5-17q9-15 6-32t-20-24l-10-4 10-4q17-7 19.5-24.5T685-700q-9-15-24-17.5t-30 3.5l-10 4v-10q0-17-11.5-28.5T581-760q-17 0-28.5 11.5T541-720v10l-10-4q-15-6-30-3.5T477-700q-8 14-5.5 31.5T491-644l10 4-10 4q-17 7-20 24t6 32q8 14 23.5 17t30.5-3l10-4v10q0 17 11.5 28.5T581-520Zm0-80q-17 0-28.5-11.5T541-640q0-17 11.5-28.5T581-680q17 0 28.5 11.5T621-640q0 17-11.5 28.5T581-600Z" />
                    </svg>
                  </div>
                  my days
                </NavLink>
                <NavLink href="/messages">
                  <div>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      height="30px"
                      viewBox="0 -960 960 960"
                      width="30px"
                    >
                      <path d="M240-400h320v-80H240v80Zm0-120h480v-80H240v80Zm0-120h480v-80H240v80ZM80-80v-720q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H240L80-80Zm126-240h594v-480H160v525l46-45Zm-46 0v-480 480Z" />
                    </svg>
                  </div>
                  messages
                </NavLink>
              </>
            )}
          </ul>
        </div>
      </div>

      {/* Lower section (profile) */}
      {user && (
        <div className="flex flex-col gap-4">
          <Link
            href={`/${user.username}`}
            className="group transition hover:text-foreground/80 text-muted-foreground flex gap-4 items-center duration-400 hover:duration-200 hover:-translate-y-1"
          >
            {user.image ? (
              <Image
                src={user.image}
                alt={user.name || "Profile"}
                width={48}
                height={48}
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
                @{user.username}
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
