import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AthleteDashboard from "./AthleteDashboard";

export default async function AthletePage() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData?.user) {
    if (process.env.NODE_ENV === "development") {
      console.log("Athlete auth user error:", userError);
    }
    redirect("/login");
  }

  const userId = userData.user.id;
  if (process.env.NODE_ENV === "development") {
    console.log("Athlete user id:", userId);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, athlete_verification_status")
    .eq("id", userId)
    .single();

  if (profile?.role === "admin") {
    redirect("/admin");
  }

  if (profileError || !profile || profile.role !== "athlete") {
    if (process.env.NODE_ENV === "development") {
      console.log("Athlete role check failed:", profile, profileError);
    }
    redirect("/role-redirect");
  }

  if (profile.athlete_verification_status !== "approved") {
    redirect("/athlete/pending");
  }

  const { data: athleteProfile, error: athleteProfileError } = await supabase
    .from("athlete_profiles")
    .select("id")
    .eq("id", userId)
    .single();

  if (athleteProfileError || !athleteProfile) {
    if (process.env.NODE_ENV === "development") {
      console.log("Athlete onboarding missing:", athleteProfileError);
    }
    redirect("/onboarding/athlete");
  }

  if (process.env.NODE_ENV === "development") {
    console.log("Athlete role:", profile.role);
  }

  return <AthleteDashboard initialXp={0} />;
}
