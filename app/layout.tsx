import "./globals.css";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { assertStartupEnv } from "@/lib/env/validation";

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

export const metadata = {
  title: "HILLink",
  description: "Connect local businesses with college athletes in minutes."
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" data-theme="light" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}