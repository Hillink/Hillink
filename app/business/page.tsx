import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import BusinessDashboard from "./BusinessDashboard";

export default async function BusinessPage() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData?.user) {
    if (process.env.NODE_ENV === "development") {
      console.log("Business auth user error:", userError);
    }
    redirect("/login");
  }

  const userId = userData.user.id;
  if (process.env.NODE_ENV === "development") {
    console.log("Business user id:", userId);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profile?.role === "admin") {
    redirect("/admin");
  }

  if (profileError || !profile || profile.role !== "business") {
    if (process.env.NODE_ENV === "development") {
      console.log("Business role check failed:", profile, profileError);
    }
    redirect("/role-redirect");
  }

  const { data: businessProfile, error: businessProfileError } = await supabase
    .from("business_profiles")
    .select("id")
    .eq("id", userId)
    .single();

  if (businessProfileError || !businessProfile) {
    if (process.env.NODE_ENV === "development") {
      console.log("Business onboarding missing:", businessProfileError);
    }
    redirect("/onboarding/business");
  }

  if (process.env.NODE_ENV === "development") {
    console.log("Business role:", profile.role);
  }

  return <BusinessDashboard />;
}
