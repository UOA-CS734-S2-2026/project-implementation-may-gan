import Image from "next/image";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="overflow-hidden relative min-h-screen flex items-center justify-center bg-background px-8">
      <div className="flex flex-col md:flex-row items-center md:gap-48 z-[1]">
        {/* Left: branding */}
        <div className="w-full flex flex-col gap-6 justify-center items-center max-w-[350px] text-center">
          <div className="w-[250px]">
            <Image
              src={"/dayli-logo.svg"}
              width={138.67}
              height={71}
              alt="Dayli logo"
              className="h-full w-full"
            />
          </div>
          <h1 className="hidden md:block font-serif text-xl font-medium tracking-tight leading-tight">
            is a daily reflective social media app, for friend groups big and
            small
          </h1>
        </div>

        {/* Right: auth card */}
        <div className="bg-white rounded-lg shadow-card p-7 flex flex-col gap-8 w-full md:w-[358px]">
          {children}
        </div>
      </div>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-[-50%] bg-[url('/dotgridbg.jpg')] bg-[40%] opacity-50 rotate-3"></div>
      </div>
    </main>
  );
}
