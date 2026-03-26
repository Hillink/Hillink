// @ts-expect-error
import "./globals.css";
import type { ReactNode } from "react";

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
    <html lang="en" data-theme="light">
      <body>{children}</body>
    </html>
  );
}