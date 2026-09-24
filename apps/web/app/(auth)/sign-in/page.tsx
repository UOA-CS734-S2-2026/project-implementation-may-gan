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
  email: z.email("Enter a valid email address"),
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
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async ({ email, password }: SignInValues) => {
    const { error } = await authClient.signIn.email({ email, password });

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
