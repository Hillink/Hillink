"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateReferralCode } from "@/lib/referrals";

type Role = "admin" | "business" | "athlete";

function normalizeRole(value: unknown): Role | null {
  if (value === "admin" || value === "business" || value === "athlete") return value;
  return null;
}

export default function RoleRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    const redirectRole = async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/login");
        return;
      }

      const user = session.user;
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      let role = normalizeRole(profile?.role);

      if (profileError || !role) {
        const intendedRole = normalizeRole(user.user_metadata?.intended_role);
        if (!intendedRole || intendedRole === "admin") {
          router.replace("/signup");
          return;
        }

        const upsertPayload =
          intendedRole === "athlete"
            ? {
                id: user.id,
                role: intendedRole,
                athlete_verification_status: "pending",
                referral_code: generateReferralCode(user.id),
              }
            : {
                id: user.id,
                role: intendedRole,
                athlete_verification_status: "approved",
                referral_code: generateReferralCode(user.id),
              };

        const { error: upsertError } = await supabase.from("profiles").upsert(upsertPayload, {
          onConflict: "id",
        });

        if (upsertError) {
          router.replace("/signup");
          return;
        }

        role = intendedRole;
      }

      if (role === "admin") {
        router.replace("/admin");
      } else if (role === "business") {
        router.replace("/business");
      } else if (role === "athlete") {
        router.replace("/athlete");
      } else {
        router.replace("/signup");
      }
    };

    redirectRole();
  }, [router]);

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h2>Verifying account...</h2>
        <p>Please wait while we redirect you to your portal.</p>
      </div>
    </div>
  );
}
