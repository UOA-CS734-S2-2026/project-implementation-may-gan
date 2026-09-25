"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/core/Button";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authClient } from "@/lib/auth/client";
import { FormInput } from "@/components/ui/FormInput";
import { LiveClock } from "@/components/ui/LiveClock";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

const signInSchema = z.object({
  identifier: z.string().min(1, "Email or username is required"),
  password: z.string().min(1, "Password is required"),
});

type SignInValues = z.infer<typeof signInSchema>;

export default function SignInPage() {
  const router = useRouter();

  const {
    control,
    handleSubmit,
    setError,
    formState: { isSubmitting, errors },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { identifier: "", password: "" },
  });

  const onSubmit = async ({ identifier, password }: SignInValues) => {
    const isEmail = identifier.includes("@");

    // Username sign-in arrives with usernames on the profile API (#68).
    if (!isEmail) {
      setError("root", { message: "Sign in with your email for now." });
      return;
    }

    const { error } = await authClient.signIn.email({ email: identifier, password });

    if (error) {
      setError("root", { message: error.message ?? "Invalid credentials." });
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
        Welcome back
      </p>

      <div className="flex flex-col gap-4">
        <GoogleSignInButton />

        <div className="relative flex items-center">
          <div className="flex-grow border-t border-foreground/10" />
          <span className="mx-3 font-serif text-sm text-foreground-tertiary">
            or
          </span>
          <div className="flex-grow border-t border-foreground/10" />
        </div>

        <FormInput
          control={control}
          name="identifier"
          label="Email or username"
          autoComplete="username"
          placeholder="you@example.com or @handle"
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
            href="/sign-up"
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
