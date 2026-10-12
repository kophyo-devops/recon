import type { Metadata } from "next";
import { IBM_Plex_Mono, Public_Sans } from "next/font/google";

import { ClientProviders } from "@/components/providers/client-providers";

import "./globals.css";

const body = Public_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "CEIR Reconciliation Portal | Payment Hub Control",
  description:
    "Enterprise workspace to compare CEIR application reports with PayPlus / IRD Payment Hub exports.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${body.variable} ${mono.variable} h-full`}
      suppressHydrationWarning
    >
      <body
        className="h-dvh overflow-hidden font-sans antialiased"
        suppressHydrationWarning
      >
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
