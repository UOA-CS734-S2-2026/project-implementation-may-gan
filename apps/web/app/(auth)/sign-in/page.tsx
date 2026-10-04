"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/core/Button";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authClient } from "@/lib/auth/client";
import { FormInput } from "@/components/ui/FormInput";
import { LiveClock } from "@/components/ui/LiveClock";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { LegalDraftMarker, LegalLinks } from "@/components/legal/LegalLinks";
import { safeAuthenticationReturnPath } from "@/lib/routing/public-return-intent";
import { getUsernameProfile } from "@/lib/profile/username";
import { useSession } from "@/lib/session/hooks";

const signInSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type SignInValues = z.infer<typeof signInSchema>;

function GoogleSignInError() {
  const error = useSearchParams().get("error");
  if (!error) return null;

  return (
    <div role="alert" className="rounded-lg bg-background-accent px-4 py-3 text-sm text-foreground-accent">
      {error === "account_not_linked" ? (
        <>
          <p className="font-semibold">Sign in with your password first</p>
          <p className="mt-1">Then go to Settings and choose Connect Google. You only need to do this once.</p>
        </>
      ) : (
        <p>Google sign-in couldn&apos;t finish. Please try again.</p>
      )}
    </div>
  );
}

function SignInForm() {
  const router = useRouter();
  const returnTo = safeAuthenticationReturnPath(useSearchParams().get("next"), "/home");
  const { user } = useSession();
  const signInInFlight = useRef(false);
  const [expectedUserId, setExpectedUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!expectedUserId || user?.id !== expectedUserId) return;
    let current = true;
    void getUsernameProfile().then((profile) => {
      if (current) router.push(profile.needsUsernameSetup ? `/setup-username?next=${encodeURIComponent(returnTo)}` : returnTo);
    }).catch(() => {
      if (current) router.push(returnTo);
    });
    return () => { current = false; };
  }, [expectedUserId, returnTo, router, user?.id]);

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting, errors },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async ({ email, password }: SignInValues) => {
    if (signInInFlight.current) return;
    signInInFlight.current = true;
    setExpectedUserId(null);
    try {
      const { data, error } = await authClient.signIn.email({ email, password });

      if (error) {
        setError("root", { message: error.message ?? "Invalid credentials." });
        return;
      }
      if (!data?.user?.id) {
        setError("root", { message: "Your session could not be verified. Please try again." });
        return;
      }

      setExpectedUserId(data.user.id);
    } finally {
      signInInFlight.current = false;
    }
  };

  return (
    <form
      method="post"
      className="flex flex-col gap-8"
      onSubmit={(event) => void handleSubmit(onSubmit)(event)}
    >
      <p className="font-serif text-2xl font-semibold text-foreground tracking-tight">
        Welcome back
      </p>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-x-1 text-xs leading-5 text-foreground-secondary">
          <LegalLinks />
          <LegalDraftMarker />
        </div>
        <GoogleSignInButton returnTo={returnTo} />
        <Suspense fallback={null}><GoogleSignInError /></Suspense>

        <div className="relative flex items-center">
          <div className="flex-grow border-t border-foreground/10" />
          <span className="mx-3 font-serif text-sm text-foreground-tertiary">
            or
          </span>
          <div className="flex-grow border-t border-foreground/10" />
        </div>

        <FormInput
          control={control}
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
        />
        <FormInput
          control={control}
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
        />
        {errors.root && (
          <p className="text-sm text-danger">{errors.root.message}</p>
        )}
        <Link
          href="/forgot-password"
          className="self-end text-xs text-foreground-secondary hover:text-foreground-accent"
        >
          Forgot password?
        </Link>
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
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
          <Button
            href={`/sign-up?next=${encodeURIComponent(returnTo)}`}
            variant={{ weight: "secondary", size: "sm", color: "foreground" }}
          >
            Sign up
          </Button>
        </div>
        <div className="flex justify-end">
          <LiveClock />
        </div>
      </div>
    </form>
  );
}

export default function SignInPage() {
  return <Suspense fallback={null}><SignInForm /></Suspense>;
}
