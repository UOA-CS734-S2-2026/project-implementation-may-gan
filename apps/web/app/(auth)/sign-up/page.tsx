"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/core/Button";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FormInput } from "@/components/ui/FormInput";
import { LiveClock } from "@/components/ui/LiveClock";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { LegalAgreement } from "@/components/legal/LegalAgreement";
import { LegalLinks } from "@/components/legal/LegalLinks";
import { issueRegistrationIntent, registrationHeaders, type CanonicalTerms } from "@/lib/legal/client";
import { apiBaseUrl } from "@/lib/api/config";
import { clearHistoryFormDraft, useHistoryFormDraft } from "@/lib/auth/history-form-draft";

const signUpSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_]{2,29}$/, "Use 3-30 lowercase letters, numbers, or underscores."),
  publicName: z.string().trim().max(80, "Public name is too long"),
  email: z.email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type SignUpValues = z.infer<typeof signUpSchema>;

export default function SignUpPage() {
  const router = useRouter();
  const [agreement, setAgreement] = useState<{ accepted: boolean; terms: CanonicalTerms | null }>({ accepted: false, terms: null });

  const {
    control,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { isSubmitting, errors },
  } = useForm<SignUpValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { username: "", publicName: "", email: "", password: "" },
  });

  useHistoryFormDraft("sign-up", reset, watch);

  const onAgreementChange = useCallback((value: { accepted: boolean; terms: CanonicalTerms | null }) => setAgreement(value), []);

  const onSubmit = async ({ username, publicName, email, password }: SignUpValues) => {
    if (!agreement.accepted || !agreement.terms || !apiBaseUrl) {
      setError("root", { message: "Read the current Terms, then confirm both declarations." });
      return;
    }
    try {
      const proof = await issueRegistrationIntent("email");
      if (proof.terms.id !== agreement.terms.id || proof.terms.contentDigest !== agreement.terms.contentDigest) {
        setAgreement({ accepted: false, terms: null });
        setError("root", { message: "The Terms changed. Read the current version before continuing." });
        return;
      }
      const response = await fetch(`${apiBaseUrl}/api/auth/sign-up/email`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", ...registrationHeaders(proof) },
        body: JSON.stringify({ name: publicName || username, username, displayUsername: publicName || undefined, email, password }),
      });
      if (!response.ok) {
        setError("root", { message: response.status === 403 || response.status === 409 ? "The Terms changed. Read the current version before continuing." : "That account couldn't be created. Check your details." });
        return;
      }
      clearHistoryFormDraft("sign-up");
      router.push("/home");
    } catch (cause) {
      setError("root", { message: cause instanceof Error ? cause.message : "Legal registration is unavailable. Try again." });
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
        <div className="space-y-1">
          <p className="text-xs leading-5 text-foreground-secondary">Privacy information is available separately from the account agreement.</p>
          <LegalLinks className="text-xs text-foreground-secondary" />
        </div>
        <GoogleSignInButton mode="signUp" agreement={agreement} onFailure={(message) => setError("root", { message })} disabled={isSubmitting || !agreement.accepted} />

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
        <LegalAgreement onChange={onAgreementChange} disabled={isSubmitting} />
        {errors.root && (
          <p role="alert" className="text-sm text-danger">{errors.root.message}</p>
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            disabled={isSubmitting || !agreement.accepted}
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
