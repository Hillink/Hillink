import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function AthletePendingPage() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData?.user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, athlete_verification_status")
    .eq("id", userData.user.id)
    .single();

  if (!profile || profile.role !== "athlete") {
    redirect("/role-redirect");
  }

  if (profile.athlete_verification_status === "approved") {
    redirect("/athlete");
  }

  const isRejected = profile.athlete_verification_status === "rejected";

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>{isRejected ? "Athlete Application Requires Updates" : "Athlete Application Under Review"}</h1>
        <p>
          {isRejected
            ? "Your application was rejected. Update your information and re-apply to continue."
            : "Your athlete account is currently pending approval. You can update profile details in settings while your application is reviewed."}
        </p>

        <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
          {isRejected && (
            <Link className="cta-button" href="/onboarding/athlete">
              Re-apply Now
            </Link>
          )}
          <Link className="secondary-button" href="/settings">
            Go to Settings
          </Link>
          <Link className={isRejected ? "secondary-button" : "cta-button"} href="/login">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
