import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";
import {
  fetchInstagramDiagnostics,
  getPerformanceBonus,
  shouldAwardPerformanceBonus,
} from "@/lib/instagram/diagnostics";
import { maybeRefreshMetaUserToken } from "@/lib/instagram/oauth";

type Body = {
  applicationId?: string;
};

export async function POST(req: NextRequest) {
  const access = await requireRoleAccess(["athlete", "business", "admin"]);
  if (!access.ok) {
    return access.response;
  }
  const userId = access.userId;
  const role = access.role;
  const supabase = access.supabase;

  const body = (await req.json()) as Body;
  const applicationId = body.applicationId?.trim();
  if (!applicationId) {
    return NextResponse.json({ error: "applicationId is required" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  const { data: appRow, error: appError } = await adminClient
    .from("campaign_applications")
    .select("id, athlete_id, campaign_id, proof_url")
    .eq("id", applicationId)
    .single();

  if (appError || !appRow) {
    return NextResponse.json({ error: appError?.message || "Application not found" }, { status: 404 });
  }

  const isAthleteOwner = appRow.athlete_id === userId;
  const isAdmin = role === "admin";

  let isBusinessOwner = false;
  if (role === "business") {
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("business_id")
      .eq("id", appRow.campaign_id)
      .single();
    isBusinessOwner = campaign?.business_id === userId;
  }

  if (!isAthleteOwner && !isAdmin && !isBusinessOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!appRow.proof_url) {
    return NextResponse.json({ error: "No proof URL found on this application" }, { status: 400 });
  }

  const { data: connection } = await adminClient
    .from("athlete_instagram_connections")
    .select("ig_user_id, access_token, token_expires_at")
    .eq("athlete_id", appRow.athlete_id)
    .single();

  const nowIso = new Date().toISOString();

  const refreshed = await maybeRefreshMetaUserToken({
    accessToken: connection?.access_token,
    tokenExpiresAt: connection?.token_expires_at,
  });

  if (connection && refreshed.refreshed) {
    await adminClient
      .from("athlete_instagram_connections")
      .update({
        access_token: refreshed.accessToken,
        token_expires_at: refreshed.tokenExpiresAt,
        last_sync_at: nowIso,
      })
      .eq("athlete_id", appRow.athlete_id);
  }

  const diagnostics = await fetchInstagramDiagnostics({
    proofUrl: appRow.proof_url,
    connection: connection
      ? {
          ig_user_id: connection.ig_user_id,
          access_token: refreshed.accessToken,
        }
      : null,
  });

  const { error: upsertError } = await adminClient
    .from("instagram_post_diagnostics")
    .upsert(
      {
        application_id: appRow.id,
        campaign_id: appRow.campaign_id,
        athlete_id: appRow.athlete_id,
        ig_media_id: diagnostics.igMediaId,
        proof_url: diagnostics.permalink,
        media_type: diagnostics.mediaType,
        caption: diagnostics.caption,
        posted_at: diagnostics.postedAt,
        likes: diagnostics.likes,
        comments: diagnostics.comments,
        saves: diagnostics.saves,
        reach: diagnostics.reach,
        impressions: diagnostics.impressions,
        video_views: diagnostics.videoViews,
        diagnostics_status: diagnostics.status,
        diagnostics_notes: diagnostics.diagnosticsNotes,
        last_synced_at: nowIso,
      },
      { onConflict: "application_id" }
    );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  if (shouldAwardPerformanceBonus(diagnostics)) {
    const bonus = getPerformanceBonus();
    const { data: existingBonus } = await adminClient
      .from("athlete_xp_events")
      .select("id")
      .eq("athlete_id", appRow.athlete_id)
      .eq("application_id", appRow.id)
      .eq("action", bonus.action)
      .maybeSingle();

    if (!existingBonus) {
      await adminClient.from("athlete_xp_events").insert({
        athlete_id: appRow.athlete_id,
        application_id: appRow.id,
        campaign_id: appRow.campaign_id,
        action: bonus.action,
        xp_delta: bonus.xp,
        details_json: {
          source: "instagram_diagnostics_performance",
          likes: diagnostics.likes,
          comments: diagnostics.comments,
          saves: diagnostics.saves,
          reach: diagnostics.reach,
          video_views: diagnostics.videoViews,
        },
      });
    }
  }

  return NextResponse.json({ success: true, diagnostics });
}
