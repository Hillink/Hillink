import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function BusinessPendingPage() {
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

  if (!profile || profile.role !== "business") {
    redirect("/role-redirect");
  }

  if (profile.athlete_verification_status === "approved") {
    redirect("/business");
  }

  const isRejected = profile.athlete_verification_status === "rejected";

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>
          {isRejected
            ? "Business Application Requires Updates"
            : "Business Account Under Review"}
        </h1>
        <p>
          {isRejected
            ? "Your application was not approved. Please update your business information and re-apply."
            : "Your business account is currently pending admin approval. You will be notified once your account is reviewed."}
        </p>

        <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
          {isRejected && (
            <Link className="cta-button" href="/onboarding/business">
              Re-apply Now
            </Link>
          )}
          <Link className="secondary-button" href="/settings">
            Go to Settings
          </Link>
          <Link
            className={isRejected ? "secondary-button" : "cta-button"}
            href="/login"
          >
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
