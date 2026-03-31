import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/requireAdminAccess";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isIgnorableSchemaError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;

  if (["42P01", "42703", "PGRST204", "PGRST205"].includes(error.code || "")) {
    return true;
  }

  const message = (error.message || "").toLowerCase();
  return (
    message.includes("schema cache") ||
    message.includes("could not find the table") ||
    message.includes("could not find the '") ||
    message.includes("relation") ||
    message.includes("does not exist") ||
    message.includes("column")
  );
}

export async function POST(req: NextRequest) {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return access.response;
  }

  let body: { userId?: string };
  try {
    body = (await req.json()) as { userId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userId = body.userId?.trim() || "";

  if (!isUuid(userId)) {
    return NextResponse.json({ error: "Valid userId UUID is required" }, { status: 400 });
  }

  if (userId === access.userId) {
    return NextResponse.json({ error: "You cannot reset your own admin account data" }, { status: 400 });
  }

  const { data: ownedCampaignRows, error: ownedCampaignError } = await access.admin
    .from("campaigns")
    .select("id")
    .eq("business_id", userId);

  if (ownedCampaignError) {
    return NextResponse.json({ error: ownedCampaignError.message }, { status: 500 });
  }

  const ownedCampaignIds = (ownedCampaignRows || []).map((r: { id: string }) => r.id);

  const applicationIds = new Set<string>();

  const { data: athleteApps, error: athleteAppsError } = await access.admin
    .from("campaign_applications")
    .select("id")
    .eq("athlete_id", userId);

  if (athleteAppsError) {
    return NextResponse.json({ error: athleteAppsError.message }, { status: 500 });
  }

  for (const row of athleteApps || []) {
    applicationIds.add((row as { id: string }).id);
  }

  if (ownedCampaignIds.length > 0) {
    const { data: campaignApps, error: campaignAppsError } = await access.admin
      .from("campaign_applications")
      .select("id")
      .in("campaign_id", ownedCampaignIds);

    if (campaignAppsError) {
      return NextResponse.json({ error: campaignAppsError.message }, { status: 500 });
    }

    for (const row of campaignApps || []) {
      applicationIds.add((row as { id: string }).id);
    }
  }

  const relatedApplicationIds = Array.from(applicationIds);

  // Gather affected athletes before deleting ratings so we can recompute aggregates.
  const affectedAthleteIds = new Set<string>();
  const skippedTables = new Set<string>();
  let ratingsAvailable = true;
  let athleteProfileRatingFieldsAvailable = true;

  const safeSelect = async <T,>(table: string, operation: any, options?: { optional?: boolean }) => {
    const result = await operation;
    if (result.error) {
      if (options?.optional && isIgnorableSchemaError(result.error)) {
        skippedTables.add(table);
        return [] as T[];
      }
      throw new Error(`${table}: ${result.error.message}`);
    }
    return result.data || [];
  };

  try {
    const candidateRatingsByAthlete = await safeSelect<{ athlete_id: string }>(
      "athlete_ratings",
      access.admin.from("athlete_ratings").select("athlete_id").eq("athlete_id", userId),
      { optional: true }
    );
    for (const row of candidateRatingsByAthlete) {
      affectedAthleteIds.add(row.athlete_id);
    }

    const candidateRatingsByBusiness = await safeSelect<{ athlete_id: string }>(
      "athlete_ratings",
      access.admin.from("athlete_ratings").select("athlete_id").eq("business_id", userId),
      { optional: true }
    );
    for (const row of candidateRatingsByBusiness) {
      affectedAthleteIds.add(row.athlete_id);
    }

    if (relatedApplicationIds.length > 0) {
      const candidateRatingsByApp = await safeSelect<{ athlete_id: string }>(
        "athlete_ratings",
        access.admin.from("athlete_ratings").select("athlete_id").in("application_id", relatedApplicationIds),
        { optional: true }
      );
      for (const row of candidateRatingsByApp) {
        affectedAthleteIds.add(row.athlete_id);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown reset error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const deleteResults: Record<string, number> = {};

  const trackDelete = async (table: string, operation: any, options?: { optional?: boolean }) => {
    const result = await operation;
    if (result.error) {
      if (options?.optional && isIgnorableSchemaError(result.error)) {
        skippedTables.add(table);
        if (table === "athlete_ratings") {
          ratingsAvailable = false;
        }
        if (table === "athlete_profiles") {
          athleteProfileRatingFieldsAvailable = false;
        }
        return;
      }
      throw new Error(`${table}: ${result.error.message}`);
    }
    deleteResults[table] = (deleteResults[table] || 0) + (result.count || 0);
  };

  try {
    await trackDelete(
      "notifications",
      access.admin.from("notifications").delete({ count: "exact" }).eq("user_id", userId),
      { optional: true }
    );

    await trackDelete(
      "instagram_post_diagnostics",
      access.admin.from("instagram_post_diagnostics").delete({ count: "exact" }).eq("athlete_id", userId),
      { optional: true }
    );
    if (ownedCampaignIds.length > 0) {
      await trackDelete(
        "instagram_post_diagnostics",
        access.admin.from("instagram_post_diagnostics").delete({ count: "exact" }).in("campaign_id", ownedCampaignIds),
        { optional: true }
      );
    }
    if (relatedApplicationIds.length > 0) {
      await trackDelete(
        "instagram_post_diagnostics",
        access.admin.from("instagram_post_diagnostics").delete({ count: "exact" }).in("application_id", relatedApplicationIds),
        { optional: true }
      );
    }

    await trackDelete(
      "athlete_ratings",
      access.admin.from("athlete_ratings").delete({ count: "exact" }).eq("athlete_id", userId),
      { optional: true }
    );
    await trackDelete(
      "athlete_ratings",
      access.admin.from("athlete_ratings").delete({ count: "exact" }).eq("business_id", userId),
      { optional: true }
    );
    if (relatedApplicationIds.length > 0) {
      await trackDelete(
        "athlete_ratings",
        access.admin.from("athlete_ratings").delete({ count: "exact" }).in("application_id", relatedApplicationIds),
        { optional: true }
      );
    }

    await trackDelete(
      "athlete_xp_events",
      access.admin.from("athlete_xp_events").delete({ count: "exact" }).eq("athlete_id", userId),
      { optional: true }
    );
    if (ownedCampaignIds.length > 0) {
      await trackDelete(
        "athlete_xp_events",
        access.admin.from("athlete_xp_events").delete({ count: "exact" }).in("campaign_id", ownedCampaignIds),
        { optional: true }
      );
    }
    if (relatedApplicationIds.length > 0) {
      await trackDelete(
        "athlete_xp_events",
        access.admin.from("athlete_xp_events").delete({ count: "exact" }).in("application_id", relatedApplicationIds),
        { optional: true }
      );
    }

    await trackDelete(
      "finance_events",
      access.admin.from("finance_events").delete({ count: "exact" }).eq("business_id", userId),
      { optional: true }
    );
    await trackDelete(
      "finance_events",
      access.admin.from("finance_events").delete({ count: "exact" }).eq("athlete_id", userId),
      { optional: true }
    );
    if (ownedCampaignIds.length > 0) {
      await trackDelete(
        "finance_events",
        access.admin.from("finance_events").delete({ count: "exact" }).in("campaign_id", ownedCampaignIds),
        { optional: true }
      );
    }
    if (relatedApplicationIds.length > 0) {
      await trackDelete(
        "finance_events",
        access.admin.from("finance_events").delete({ count: "exact" }).in("application_id", relatedApplicationIds),
        { optional: true }
      );
    }

    await trackDelete(
      "athlete_verification_audit_logs",
      access.admin.from("athlete_verification_audit_logs").delete({ count: "exact" }).eq("actor_admin_id", userId),
      { optional: true }
    );
    await trackDelete(
      "athlete_verification_audit_logs",
      access.admin.from("athlete_verification_audit_logs").delete({ count: "exact" }).eq("athlete_id", userId),
      { optional: true }
    );

    await trackDelete(
      "athlete_instagram_connections",
      access.admin.from("athlete_instagram_connections").delete({ count: "exact" }).eq("athlete_id", userId),
      { optional: true }
    );

    await trackDelete(
      "campaign_applications",
      access.admin.from("campaign_applications").delete({ count: "exact" }).eq("athlete_id", userId)
    );
    if (ownedCampaignIds.length > 0) {
      await trackDelete(
        "campaign_applications",
        access.admin.from("campaign_applications").delete({ count: "exact" }).in("campaign_id", ownedCampaignIds)
      );
    }

    await trackDelete(
      "campaigns",
      access.admin.from("campaigns").delete({ count: "exact" }).eq("business_id", userId)
    );

    const athleteIdsToRecompute = Array.from(affectedAthleteIds);
    if (ratingsAvailable && athleteProfileRatingFieldsAvailable) {
      for (const athleteId of athleteIdsToRecompute) {
        const remainingRatings = await safeSelect<{ rating: number }>(
          "athlete_ratings",
          access.admin.from("athlete_ratings").select("rating").eq("athlete_id", athleteId),
          { optional: true }
        );

        const ratings = remainingRatings
          .map((row: { rating: number }) => Number(row.rating))
          .filter((rating: number) => Number.isFinite(rating));
        const total = ratings.length;
        const avg = total > 0 ? ratings.reduce((sum: number, rating: number) => sum + rating, 0) / total : null;

        const { error: profileUpdateErr } = await access.admin
          .from("athlete_profiles")
          .update({ average_rating: avg, total_ratings: total })
          .eq("id", athleteId);

        if (profileUpdateErr) {
          if (isIgnorableSchemaError(profileUpdateErr)) {
            skippedTables.add("athlete_profiles");
            athleteProfileRatingFieldsAvailable = false;
            break;
          }
          throw new Error(`athlete_profiles update: ${profileUpdateErr.message}`);
        }
      }

      if (athleteProfileRatingFieldsAvailable) {
        const { error: targetProfileUpdateErr } = await access.admin
          .from("athlete_profiles")
          .update({ average_rating: null, total_ratings: 0 })
          .eq("id", userId);

        if (targetProfileUpdateErr) {
          if (isIgnorableSchemaError(targetProfileUpdateErr)) {
            skippedTables.add("athlete_profiles");
            athleteProfileRatingFieldsAvailable = false;
          } else {
            throw new Error(`athlete_profiles update: ${targetProfileUpdateErr.message}`);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      userId,
      deleted: deleteResults,
      recomputedAthletes: athleteIdsToRecompute.length,
      skipped: Array.from(skippedTables),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown reset error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

