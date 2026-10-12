"use client";

import type { ReactNode } from "react";

import { AppFeedbackProvider } from "@/components/providers/app-feedback";

export function ClientProviders({ children }: { children: ReactNode }) {
  return <AppFeedbackProvider>{children}</AppFeedbackProvider>;
}
