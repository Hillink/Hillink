import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";

type ChallengeDef = {
  id: string;
  title: string;
  target: number;
  reward: number;
  progress: number;
  action: "weekly_activity_streak" | "monthly_activity_streak" | "connect_instagram" | "repeat_business_bonus";
};

export async function POST() {
  const access = await requireRoleAccess(["athlete"]);
  if (!access.ok) {
    return access.response;
  }
  const userId = access.userId;

  const adminClient = createAdminClient();

  const [{ data: applications, error: appsError }, { data: diagnostics, error: diagnosticsError }, { data: challengeEvents, error: challengeEventsError }] = await Promise.all([
    adminClient
      .from("campaign_applications")
      .select("status")
      .eq("athlete_id", userId),
    adminClient
      .from("instagram_post_diagnostics")
      .select("diagnostics_status")
      .eq("athlete_id", userId),
    adminClient
      .from("athlete_xp_events")
      .select("id, details_json")
      .eq("athlete_id", userId)
      .in("action", ["weekly_activity_streak", "monthly_activity_streak", "connect_instagram", "repeat_business_bonus"]),
  ]);

  if (appsError) {
    return NextResponse.json({ error: appsError.message }, { status: 500 });
  }

  if (diagnosticsError && !diagnosticsError.message.toLowerCase().includes("instagram_post_diagnostics")) {
    return NextResponse.json({ error: diagnosticsError.message }, { status: 500 });
  }

  if (challengeEventsError && !challengeEventsError.message.toLowerCase().includes("athlete_xp_events")) {
    return NextResponse.json({ error: challengeEventsError.message }, { status: 500 });
  }

  const activeCampaignParticipation = (applications || []).filter(
    (a) => a.status !== "withdrawn" && a.status !== "declined"
  ).length;
  const submittedCount = (applications || []).filter(
    (a) => a.status === "submitted" || a.status === "approved" || a.status === "rejected"
  ).length;
  const approvedCount = (applications || []).filter((a) => a.status === "approved").length;
  const verifiedDiagnosticsCount = (diagnostics || []).filter((d) => d.diagnostics_status === "verified").length;

  const challenges: ChallengeDef[] = [
    {
      id: "campaign-starter",
      title: "Campaign Starter",
      target: 3,
      reward: 75,
      progress: activeCampaignParticipation,
      action: "weekly_activity_streak",
    },
    {
      id: "proof-pro",
      title: "Proof Pro",
      target: 2,
      reward: 60,
      progress: submittedCount,
      action: "monthly_activity_streak",
    },
    {
      id: "diagnostics-verified",
      title: "Diagnostics Verified",
      target: 1,
      reward: 50,
      progress: verifiedDiagnosticsCount,
      action: "connect_instagram",
    },
    {
      id: "closer",
      title: "Closer",
      target: 2,
      reward: 120,
      progress: approvedCount,
      action: "repeat_business_bonus",
    },
  ];

  const awardedIds = new Set<string>();
  for (const row of challengeEvents || []) {
    const details = (row as { details_json?: Record<string, unknown> | null }).details_json;
    if (details && details.source === "xp_challenge" && typeof details.challenge_id === "string") {
      awardedIds.add(details.challenge_id);
    }
  }

  const toInsert = challenges
    .filter((challenge) => challenge.progress >= challenge.target)
    .filter((challenge) => !awardedIds.has(challenge.id))
    .map((challenge) => ({
      athlete_id: userId,
      action: challenge.action,
      xp_delta: challenge.reward,
      details_json: {
        source: "xp_challenge",
        challenge_id: challenge.id,
        challenge_title: challenge.title,
        target: challenge.target,
      },
    }));

  if (toInsert.length) {
    const { error: insertError } = await adminClient.from("athlete_xp_events").insert(toInsert);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Notify athlete for each challenge completed
    for (const row of toInsert) {
      const challenge = challenges.find(
        (c) => c.id === (row.details_json as { challenge_id: string }).challenge_id
      );
      if (challenge) {
        await createNotification({
          userId,
          type: "challenge_completed",
          title: `Challenge Complete: ${challenge.title}`,
          body: `You earned ${challenge.reward} XP for completing the "${challenge.title}" challenge!`,
          metadata: { challengeId: challenge.id, xpAwarded: challenge.reward },
        });
      }
    }
  }

  return NextResponse.json({
    success: true,
    granted: toInsert.length,
    grantedTitles: challenges
      .filter((challenge) => toInsert.some((row) => row.details_json.challenge_id === challenge.id))
      .map((c) => c.title),
  });
}
