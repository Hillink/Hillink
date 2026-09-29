import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./help.css";

// The Help Center is for signed-in Hillink users only; keep it out of search engines too.
export const metadata: Metadata = {
  title: "Help | HILLink",
  robots: { index: false, follow: false },
};

export default function HelpLayout({ children }: { children: ReactNode }) {
  return children;
}
