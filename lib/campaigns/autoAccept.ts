import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notifications";

type AutoAcceptResult = {
  ok: boolean;
  code?: string;
  message?: string;
  application_id?: string;
  distance_miles?: number;
};

function failureStatus(code?: string): number {
  if (!code) return 500;
  if (code === "campaign_not_found") return 404;
  if (code === "duplicate_application" || code === "slot_conflict") return 409;
  if (code === "forbidden" || code === "athlete_flagged" || code === "tier_too_low") return 403;
  if (code === "athlete_not_verified") return 403;
  if (code === "missing_coordinates" || code === "outside_radius") return 422;
  if (code === "campaign_inactive" || code === "campaign_locked" || code === "no_open_slots") return 409;
  return 400;
}

export async function attemptAutoAcceptForAthlete(params: {
  campaignId: string;
  athleteId: string;
}) {
  const admin = createAdminClient();

  const { data, error } = await admin.rpc("attempt_auto_accept", {
    p_campaign_id: params.campaignId,
    p_athlete_id: params.athleteId,
  });

  if (error) {
    return {
      status: 500,
      body: { error: error.message },
    };
  }

  const result = (data || {}) as AutoAcceptResult;
  if (!result.ok) {
    return {
      status: failureStatus(result.code),
      body: {
        error: result.message || "Auto-accept failed",
        code: result.code || "unknown",
        distanceMiles: result.distance_miles ?? null,
      },
    };
  }

  const [{ data: campaign }, { data: athleteProfile }] = await Promise.all([
    admin
      .from("campaigns")
      .select("id, title, business_id")
      .eq("id", params.campaignId)
      .single(),
    admin
      .from("athlete_profiles")
      .select("first_name, last_name, school, sport")
      .eq("id", params.athleteId)
      .single(),
  ]);

  if (campaign) {
    const athleteName = athleteProfile
      ? `${athleteProfile.first_name ?? ""} ${athleteProfile.last_name ?? ""}`.trim() || "Athlete"
      : "Athlete";
    const schoolSport = `${athleteProfile?.school || "Unknown school"} / ${athleteProfile?.sport || "Unknown sport"}`;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    try {
      const businessUserAuth = await admin.auth.admin.getUserById(campaign.business_id);

      await notifyUser({
        userId: campaign.business_id,
        email: businessUserAuth.data.user?.email ? { to: businessUserAuth.data.user.email } : undefined,
        type: "new_application",
        title: "Athlete auto-accepted",
        body: `${athleteName} auto-qualified for "${campaign.title}" and was accepted instantly.`,
        ctaLabel: "View Campaign",
        ctaUrl: `${appUrl}/business`,
        metadata: {
          applicationId: result.application_id,
          campaignId: campaign.id,
          campaignTitle: campaign.title,
          athleteId: params.athleteId,
          athleteName,
          schoolSport,
          acceptedVia: "auto",
          distanceMiles: result.distance_miles ?? null,
        },
      });
    } catch {
      // Notification failures should not undo accepted applications.
    }
  }

  return {
    status: 200,
    body: {
      success: true,
      accepted: true,
      applicationId: result.application_id,
      acceptedVia: "auto",
      distanceMiles: result.distance_miles ?? null,
    },
  };
}
