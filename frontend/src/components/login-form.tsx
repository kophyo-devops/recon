"use client";

import { Spinner } from "@heroui/react";
import { FormEvent, useState } from "react";

import { useAppFeedback } from "@/components/providers/app-feedback";
import { ApiError, loginRequest } from "@/lib/api";
import type { AuthUser } from "@/lib/auth";

const APP_VERSION = "0.1.0";

type LoginFormProps = {
  onSuccess: (user: AuthUser) => void;
  bannerMessage?: string | null;
};

export function LoginForm({ onSuccess, bannerMessage }: LoginFormProps) {
  const feedback = useAppFeedback();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const user = await loginRequest(username.trim(), password);
      onSuccess(user);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.status === 401
            ? "Invalid credentials"
            : err.message
          : "Login failed. Is the API running?";
      setError(message);
      feedback.error("Login failed", message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-[#eceef1] px-4 py-6">
      <div className="w-full max-w-[420px]">
        <h1 className="mb-6 text-center text-[28px] leading-none tracking-tight text-[#12151a]">
          <span className="font-bold">CEIR</span>{" "}
          <span className="font-normal">Reconciliation Portal</span>
        </h1>

        <div className="login-card">
          <div className="border-b border-[#e6edf3] px-6 py-5">
            <p className="text-[13px] text-[var(--muted)]">
              Sign in to continue to CEIR Reconciliation Portal.
            </p>
            {bannerMessage ? (
              <p
                className="mt-2 text-[13px] font-medium text-[var(--signal)]"
                role="status"
                aria-live="polite"
              >
                {bannerMessage}
              </p>
            ) : null}
          </div>

          <form className="space-y-4 px-6 py-5" onSubmit={(e) => void handleSubmit(e)}>
            <div>
              <label
                htmlFor="login-username"
                className="mb-1.5 block text-[13px] font-medium text-[#12151a]"
              >
                Username <span className="text-[#9b2c2c]">*</span>
              </label>
              <input
                id="login-username"
                name="username"
                className="login-field"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="mb-1.5 block text-[13px] font-medium text-[#12151a]"
              >
                Password <span className="text-[#9b2c2c]">*</span>
              </label>
              <div className="login-field-wrap">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  className="login-field"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="login-field-toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {error ? (
              <p className="text-[12px] text-[#9b2c2c]">{error}</p>
            ) : null}

            <button type="submit" className="login-submit" disabled={isSubmitting}>
              {isSubmitting ? <Spinner color="current" size="sm" /> : null}
              Login
            </button>
          </form>
        </div>

        <p className="mt-3 text-right text-[12px] text-[#12151a]">
          Version: {APP_VERSION}
        </p>
      </div>
    </div>
  );
}
