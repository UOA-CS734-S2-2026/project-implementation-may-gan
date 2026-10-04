"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/core/Button";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authClient } from "@/lib/auth/client";
import { FormInput } from "@/components/ui/FormInput";
import { LiveClock } from "@/components/ui/LiveClock";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { LegalDraftMarker, LegalLinks } from "@/components/legal/LegalLinks";
import { issueRegistrationProof, readCurrentRegistrationTerms, registrationHeaders, type CurrentRegistrationTerms } from "@/lib/legal/registration";
import { safeAuthenticationReturnPath } from "@/lib/routing/public-return-intent";

const signUpSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_]{2,29}$/, "Use 3-30 lowercase letters, numbers, or underscores."),
  publicName: z.string().trim().max(80, "Public name is too long"),
  email: z.email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type SignUpValues = z.infer<typeof signUpSchema>;

function SignUpForm() {
  const router = useRouter();
  const returnTo = safeAuthenticationReturnPath(useSearchParams().get("next"), "/home");
  const [terms, setTerms] = useState<CurrentRegistrationTerms | null>(null);
  const [termsError, setTermsError] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    let active = true;
    readCurrentRegistrationTerms().then((current) => {
      if (active) setTerms(current);
    }).catch(() => {
      if (active) setTermsError(true);
    });
    return () => { active = false; };
  }, []);

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting, errors },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { username: "", publicName: "", email: "", password: "" },
  });

  async function prepareRegistration(flow: "email" | "google_browser") {
    if (!terms || termsError) throw new Error("Registration terms cannot be verified right now.");
    if (terms.status === "effective" && !accepted) throw new Error("Confirm the Terms and that you are 16 or older.");
    try {
      return await issueRegistrationProof(flow, terms);
    } catch {
      setAccepted(false);
      setTerms(null);
      readCurrentRegistrationTerms().then(setTerms).catch(() => setTermsError(true));
      throw new Error("Registration terms changed. Check the documents and try again.");
    }
  }

  const onSubmit = async ({ username, publicName, email, password }: SignUpValues) => {
    try {
      const proof = await prepareRegistration("email");
      // Better Auth requires name, but the handle remains the public fallback.
      const { error } = await authClient.signUp.email({
        name: publicName || username, username, displayUsername: publicName || undefined, email, password,
        fetchOptions: { headers: registrationHeaders(proof) },
      } as Parameters<typeof authClient.signUp.email>[0]);
      if (error) throw new Error(error.message ?? "Registration failed.");
      router.push(returnTo);
    } catch (error) {
      setError("root", { message: error instanceof Error ? error.message : "Registration failed." });
    }
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
        <div className="flex flex-wrap items-baseline gap-x-1 text-xs leading-5 text-foreground-secondary">
          <LegalLinks />
          <LegalDraftMarker />
        </div>
        <GoogleSignInButton
          returnTo={returnTo}
          disabled={!terms || termsError}
          prepareRegistration={() => prepareRegistration("google_browser")}
          onRegistrationError={(message) => setError("root", { message })}
        />

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
        {terms?.status === "effective" && (
          <div className="flex items-start gap-3 text-xs leading-5 text-foreground-secondary">
            <input
              id="registration-legal-action"
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
              className="mt-1 size-4 shrink-0 accent-foreground"
            />
            <div>
              <label htmlFor="registration-legal-action">
                I agree to the Terms of Service, acknowledge the Privacy Policy, and confirm I am 16 or older.
              </label>
              <p>
                <Link href="/terms" className="underline underline-offset-2">Terms of Service</Link>
                {" · "}
                <Link href="/privacy" className="underline underline-offset-2">Privacy Policy</Link>
              </p>
            </div>
          </div>
        )}
        {termsError && <p role="alert" className="text-sm text-danger">Registration terms cannot be verified right now.</p>}
        {errors.root && (
          <p className="text-sm text-danger">{errors.root.message}</p>
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            disabled={isSubmitting || !terms || termsError}
            variant={{ weight: "secondary", size: "sm", color: "accent" }}
            arrow
          >
            {isSubmitting ? "Creating…" : "Let's go"}
          </Button>
          <Button
            href={`/sign-in?next=${encodeURIComponent(returnTo)}`}
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

export default function SignUpPage() {
  return <Suspense fallback={null}><SignUpForm /></Suspense>;
}
