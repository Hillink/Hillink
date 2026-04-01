import "./globals.css";
import { Inter } from "next/font/google";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { assertStartupEnv } from "@/lib/env/validation";
import SiteFooter from "@/components/SiteFooter";

const startupValidationState = globalThis as typeof globalThis & {
  __hillinkStartupEnvChecked?: boolean;
};

if (!startupValidationState.__hillinkStartupEnvChecked) {
  startupValidationState.__hillinkStartupEnvChecked = true;
  assertStartupEnv();
}

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "HILLink",
  description: "Connect local businesses with college athletes in minutes.",
  icons: {
    icon: [{ url: "/ll-logo.png", type: "image/png" }],
    shortcut: "/ll-logo.png",
    apple: "/ll-logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" data-theme="light" className={inter.variable}>
      <body>
        <div className="site-shell">
          <div className="site-main">{children}</div>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}