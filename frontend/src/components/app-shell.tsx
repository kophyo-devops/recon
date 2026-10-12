"use client";

import { useEffect, useState } from "react";

import { LoginForm } from "@/components/login-form";
import { useAppFeedback } from "@/components/providers/app-feedback";
import { ReconApp } from "@/components/recon-app";
import {
  ApiError,
  fetchCurrentUser,
  logoutRequest,
  refreshSession,
} from "@/lib/api";
import type { AuthUser } from "@/lib/auth";
import {
  SESSION_EXPIRED_MESSAGE,
  onSessionExpired,
} from "@/lib/auth-session";

export function AppShell() {
  const feedback = useAppFeedback();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [booted, setBooted] = useState(false);
  const [sessionMessage, setSessionMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const me = await fetchCurrentUser();
        if (!cancelled) setUser(me);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          try {
            const refreshed = await refreshSession();
            if (!cancelled) setUser(refreshed);
          } catch {
            if (!cancelled) setUser(null);
          }
        } else if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) setBooted(true);
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return onSessionExpired((message) => {
      setUser(null);
      setSessionMessage(message || SESSION_EXPIRED_MESSAGE);
    });
  }, []);

  async function handleLogout() {
    const ok = await feedback.confirm({
      title: "Log out?",
      message: "You will need to sign in again to use the portal.",
      confirmLabel: "Log out",
      cancelLabel: "Stay signed in",
      tone: "warning",
    });
    if (!ok) return;

    try {
      await logoutRequest();
      feedback.success("Logged out");
    } catch {
      feedback.warning(
        "Logged out locally",
        "Could not reach the API, but your session was cleared in this browser.",
      );
    }
    setSessionMessage(null);
    setUser(null);
  }

  if (!booted) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-[#eceef1] text-[13px] text-[var(--muted)]">
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <LoginForm
        bannerMessage={sessionMessage}
        onSuccess={(next) => {
          setUser(next);
          setSessionMessage(null);
          feedback.success("Welcome", `Signed in as ${next.username}`);
        }}
      />
    );
  }

  return (
    <ReconApp username={user.username} onLogout={() => void handleLogout()} />
  );
}
