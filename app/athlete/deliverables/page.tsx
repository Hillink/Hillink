import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AthleteDeliverablesDashboard from "./AthleteDeliverablesDashboard";

export const dynamic = "force-dynamic";

export default async function AthleteDeliverablesPage() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData?.user) redirect("/login");

  const userId = userData.user.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, athlete_verification_status")
    .eq("id", userId)
    .single();

  if (!profile || profile.role !== "athlete") redirect("/role-redirect");
  if (profile.athlete_verification_status !== "approved") redirect("/athlete/pending");

  return <AthleteDeliverablesDashboard />;
}
