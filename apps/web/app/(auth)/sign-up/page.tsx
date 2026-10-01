"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/core/Button";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authClient } from "@/lib/auth/client";
import { FormInput } from "@/components/ui/FormInput";
import { LiveClock } from "@/components/ui/LiveClock";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { LegalDraftNotice, LegalLinks } from "@/components/legal/LegalLinks";

const signUpSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_]{2,29}$/, "Use 3-30 lowercase letters, numbers, or underscores."),
  publicName: z.string().trim().max(80, "Public name is too long"),
  email: z.email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type SignUpValues = z.infer<typeof signUpSchema>;

export default function SignUpPage() {
  const router = useRouter();

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting, errors },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { username: "", publicName: "", email: "", password: "" },
  });

  const onSubmit = async ({ username, publicName, email, password }: SignUpValues) => {
    // Better Auth requires name, but the handle remains the public fallback.
    const { error } = await authClient.signUp.email({ name: publicName || username, username, displayUsername: publicName || undefined, email, password } as Parameters<typeof authClient.signUp.email>[0]);

    if (error) {
      setError("root", { message: error.message ?? "Something went wrong." });
      return;
    }

    router.push("/home");
  };

  return (
    <form
      method="post"
      className="flex flex-col gap-8"
      onSubmit={handleSubmit(onSubmit)}
    >
      <p className="font-serif text-2xl font-semibold text-foreground tracking-tight">
        Let&apos;s get you started
      </p>

      <div className="flex flex-col gap-4">
        <div className="space-y-1">
          <p className="text-xs leading-5 text-foreground-secondary">Review Dayli&apos;s draft legal documents before creating an account or continuing with Google.</p>
          <LegalLinks className="text-xs text-foreground-secondary" />
          <LegalDraftNotice />
        </div>
        <GoogleSignInButton />

        <div className="relative flex items-center">
          <div className="flex-grow border-t border-foreground/10" />
          <span className="mx-3 font-serif text-xs text-foreground/40">or</span>
          <div className="flex-grow border-t border-foreground/10" />
        </div>

        <FormInput
          control={control}
          name="username"
          label="Username"
          autoComplete="username"
        />
        <FormInput
          control={control}
          name="publicName"
          label="Public name (optional)"
          autoComplete="name"
        />
        <FormInput
          control={control}
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
        />
        <FormInput
          control={control}
          name="password"
          label="Password"
          type="password"
          autoComplete="new-password"
        />
        {errors.root && (
          <p className="text-sm text-danger">{errors.root.message}</p>
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            disabled={isSubmitting}
            variant={{ weight: "secondary", size: "sm", color: "accent" }}
            arrow
          >
            {isSubmitting ? "Creating…" : "Let's go"}
          </Button>
          <Button
            href="/sign-in"
            variant={{ weight: "secondary", size: "sm", color: "foreground" }}
          >
            I have an account
          </Button>
        </div>
        <div className="flex justify-end">
          <LiveClock />
        </div>
      </div>
    </form>
  );
}
