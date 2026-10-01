import { ServerUsernameGuard } from "@/components/auth/ServerUsernameGuard";

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return <ServerUsernameGuard returnTo="/setup-username" allowUsernameSetup>{children}</ServerUsernameGuard>;
}
