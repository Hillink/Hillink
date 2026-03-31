import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/requireAdminAccess";
import { notifyUser } from "@/lib/notifications";
import { sendAthleteVerificationEmail } from "@/lib/email/athleteVerification";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(req: NextRequest) {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return access.response;
  }

  let body: {
    userId?: string;
    status?: "pending" | "approved" | "rejected";
    reason?: string;
  };
  try {
    body = (await req.json()) as {
      userId?: string;
      status?: "pending" | "approved" | "rejected";
      reason?: string;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { userId, status, reason } = body;

  if (!userId || !status) {
    return NextResponse.json({ error: "userId and status are required" }, { status: 400 });
  }
  if (!isUuid(userId)) {
    return NextResponse.json({ error: "userId must be a valid UUID" }, { status: 400 });
  }

  if (!["pending", "approved", "rejected"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const trimmedReason = (reason || "").trim();
  if (status === "rejected" && !trimmedReason) {
    return NextResponse.json({ error: "Rejection reason is required" }, { status: 400 });
  }

  const { data: currentAthlete } = await access.admin
    .from("profiles")
    .select("athlete_verification_status")
    .eq("id", userId)
    .eq("role", "athlete")
    .single();

  const { error: updateError } = await access.admin
    .from("profiles")
    .update({ athlete_verification_status: status })
    .eq("id", userId)
    .eq("role", "athlete");

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { error: auditError } = await access.admin.from("athlete_verification_audit_logs").insert({
    athlete_id: userId,
    actor_admin_id: access.userId,
    previous_status: currentAthlete?.athlete_verification_status || null,
    next_status: status,
    reason: trimmedReason || null,
  });

  if (auditError) {
    return NextResponse.json({ error: `Verification updated but audit log failed: ${auditError.message}` }, { status: 500 });
  }

  let emailWarning: string | null = null;
  try {
    const { data: authUserData, error: authUserError } = await access.admin.auth.admin.getUserById(userId);

    if (authUserError) {
      emailWarning = authUserError.message;
    } else if (authUserData.user?.email && status !== "pending") {
      const emailRes = await sendAthleteVerificationEmail({
        to: authUserData.user.email,
        status,
        reason: trimmedReason || undefined,
      });
      if (!emailRes.sent) {
        emailWarning = emailRes.reason || "Email not sent";
      }

      await notifyUser({
        userId,
        type: status === "approved" ? "verification_approved" : "verification_rejected",
        title: status === "approved" ? "You're verified" : "Verification update",
        body:
          status === "approved"
            ? "Your account has been verified."
            : `Your verification request was not approved.${trimmedReason ? ` Reason: ${trimmedReason}` : ""}`,
        metadata: {
          reason: trimmedReason || null,
          status,
        },
        email: { to: authUserData.user.email },
      });
    }
  } catch (e) {
    emailWarning = e instanceof Error ? e.message : "Email provider unavailable";
  }

  return NextResponse.json({ success: true, emailWarning });
}
