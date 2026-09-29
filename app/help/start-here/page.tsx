import { redirect } from "next/navigation";
import { START_HERE_SLUGS } from "@/lib/help/categories";
import { requireHelpViewer } from "@/lib/help/server";

export const dynamic = "force-dynamic";

// One link for welcome emails and onboarding: sends each person to the Start Here guide for their account type.
export default async function HelpStartHerePage() {
  const viewer = await requireHelpViewer("/help/start-here");
  if (viewer.role === "admin") redirect("/help");
  redirect(`/help/getting-started/${START_HERE_SLUGS[viewer.role]}`);
}
