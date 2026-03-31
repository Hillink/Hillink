import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRoleAccess } from "@/lib/auth/requireRoleAccess";
import {
  fetchInstagramDiagnostics,
  getPerformanceBonus,
  isInstagramUrl,
  shouldAwardPerformanceBonus,
} from "@/lib/instagram/diagnostics";
import { maybeRefreshMetaUserToken } from "@/lib/instagram/oauth";
import { createNotification } from "@/lib/notifications";

type SubmitBody = {
  applicationId?: string;
  proofUrl?: string;
  proofNotes?: string;
};

export async function POST(req: NextRequest) {
  const access = await requireRoleAccess(["athlete"]);
  if (!access.ok) {
    return access.response;
  }
  const userId = access.userId;

  const body = (await req.json()) as SubmitBody;
  const applicationId = body.applicationId?.trim();
  const proofUrl = body.proofUrl?.trim();

  if (!applicationId) {
    return NextResponse.json({ error: "applicationId is required" }, { status: 400 });
  }

  if (!proofUrl) {
    return NextResponse.json({ error: "Proof URL is required" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  const { data: appRow, error: appError } = await adminClient
    .from("campaign_applications")
    .select("id, athlete_id, campaign_id, status")
    .eq("id", applicationId)
    .single();

  if (appError || !appRow) {
    return NextResponse.json({ error: appError?.message || "Application not found" }, { status: 404 });
  }

  if (appRow.athlete_id !== userId) {
    return NextResponse.json({ error: "Not allowed for this application" }, { status: 403 });
  }

  if (appRow.status !== "accepted" && appRow.status !== "submitted") {
    return NextResponse.json({ error: "Proof can only be submitted for accepted applications" }, { status: 400 });
  }

  const nowIso = new Date().toISOString();

  const { error: updateError } = await adminClient
    .from("campaign_applications")
    .update({
      status: "submitted",
      proof_url: proofUrl,
      proof_notes: body.proofNotes?.trim() || null,
      submitted_at: nowIso,
    })
    .eq("id", applicationId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Notify the business that proof has been submitted
  const { data: campaignRow } = await adminClient
    .from("campaigns")
    .select("title, business_id")
    .eq("id", appRow.campaign_id)
    .single();

  if (campaignRow) {
    const { data: athleteProfileRow } = await adminClient
      .from("athlete_profiles")
      .select("first_name, last_name")
      .eq("id", userId)
      .single();
    const athleteName =
      athleteProfileRow
        ? `${athleteProfileRow.first_name ?? ""} ${athleteProfileRow.last_name ?? ""}`.trim() || "An athlete"
        : "An athlete";
    await createNotification({
      userId: campaignRow.business_id,
      type: "proof_submitted",
      title: "New Proof Submission",
      body: `${athleteName} submitted proof for "${campaignRow.title}". Review it in your campaign dashboard.`,
      metadata: { applicationId, campaignId: appRow.campaign_id, athleteId: userId },
    });
  }

  if (!isInstagramUrl(proofUrl)) {
    return NextResponse.json({
      success: true,
      diagnostics: null,
      warning: "Proof submitted. Diagnostics are currently available for Instagram URLs.",
    });
  }

  const { data: connection } = await adminClient
    .from("athlete_instagram_connections")
    .select("ig_user_id, access_token, token_expires_at")
    .eq("athlete_id", userId)
    .single();

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
      .eq("athlete_id", userId);
  }

  const diagnostics = await fetchInstagramDiagnostics({
    proofUrl,
    connection: connection
      ? {
          ig_user_id: connection.ig_user_id,
          access_token: refreshed.accessToken,
        }
      : null,
  });

  const { error: diagnosticsError } = await adminClient
    .from("instagram_post_diagnostics")
    .upsert(
      {
        application_id: applicationId,
        campaign_id: appRow.campaign_id,
        athlete_id: userId,
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

  if (diagnosticsError) {
    return NextResponse.json({ error: diagnosticsError.message }, { status: 500 });
  }

  if (shouldAwardPerformanceBonus(diagnostics)) {
    const bonus = getPerformanceBonus();
    const { data: existingBonus } = await adminClient
      .from("athlete_xp_events")
      .select("id")
      .eq("athlete_id", userId)
      .eq("application_id", applicationId)
      .eq("action", bonus.action)
      .maybeSingle();

    if (!existingBonus) {
      await adminClient.from("athlete_xp_events").insert({
        athlete_id: userId,
        application_id: applicationId,
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

  return NextResponse.json({
    success: true,
    diagnostics,
  });
}
