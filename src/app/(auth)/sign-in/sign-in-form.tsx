"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input, Label, Alert, Spinner } from "@/components/ui/primitives";

export function SignInForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const [step, setStep] = React.useState<"email" | "code">("email");
  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email: email.trim().toLowerCase(), type: "sign-in" });
    setBusy(false);
    if (error) return setError(error.message ?? "Could not send the code. Check the address and try again.");
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await authClient.signIn.emailOtp({ email: email.trim().toLowerCase(), otp: code.trim() });
    setBusy(false);
    if (error) return setError(error.message ?? "That code did not work. Check it and try again.");
    router.push("/studio");
    router.refresh();
  }

  async function google() {
    setBusy(true);
    await authClient.signIn.social({ provider: "google", callbackURL: "/studio" });
  }

  return (
    <div className="space-y-5">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {step === "email" ? (
        <form onSubmit={sendCode} className="space-y-4">
          <div>
            <Label htmlFor="email">Email address</Label>
            <Input id="email" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@yourboutique.in" autoFocus />
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy ? <Spinner /> : null} Email me a code
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          <div>
            <Label htmlFor="code">Six-digit code</Label>
            <Input
              id="code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="text-center font-mono text-2xl tracking-[0.5em]"
              autoFocus
            />
            <p className="mt-2 text-xs text-ink-2">
              Sent to <span className="font-medium text-ink">{email}</span>.{" "}
              <button type="button" className="underline" onClick={() => setStep("email")}>
                Change
              </button>
            </p>
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={busy || code.length !== 6}>
            {busy ? <Spinner /> : null} Continue
          </Button>
          <Button type="button" variant="ghost" size="sm" className="w-full" onClick={sendCode} disabled={busy}>
            Resend code
          </Button>
        </form>
      )}
      {googleEnabled ? (
        <>
          <div className="relative text-center text-xs text-ink-3">
            <span className="relative z-10 bg-canvas px-3">or</span>
            <span className="absolute inset-x-0 top-1/2 h-px bg-line" aria-hidden="true" />
          </div>
          <Button type="button" variant="secondary" className="w-full" size="lg" onClick={google} disabled={busy}>
            Continue with Google
          </Button>
        </>
      ) : null}
    </div>
  );
}
