import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth/requireAdminAccess";
import { createWaitlistAdminClient } from "@/lib/supabase/waitlist-admin";

type WaitlistStatus = "new" | "contacted" | "approved" | "rejected";

type UpdateBody = {
  status?: WaitlistStatus;
  adminNotes?: string | null;
};

const ALLOWED_STATUS = new Set<WaitlistStatus>(["new", "contacted", "approved", "rejected"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return access.response;
  }

  let waitlistAdmin;
  try {
    waitlistAdmin = createWaitlistAdminClient();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Waitlist client is not configured.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const { id } = await params;
  const waitlistId = String(id || "").trim();
  if (!waitlistId) {
    return NextResponse.json({ error: "Waitlist entry id is required." }, { status: 400 });
  }

  let body: UpdateBody;
  try {
    body = (await req.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const status = String(body.status || "").trim().toLowerCase() as WaitlistStatus;
  if (!ALLOWED_STATUS.has(status)) {
    return NextResponse.json({ error: "Invalid waitlist status." }, { status: 400 });
  }

  const notes = typeof body.adminNotes === "string" ? body.adminNotes.trim() : "";

  const { data, error } = await waitlistAdmin
    .from("athlete_waitlist")
    .update({
      status,
      admin_notes: notes ? notes : null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: access.userId,
    })
    .eq("id", waitlistId)
    .select("id, status, admin_notes, reviewed_at, reviewed_by")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Waitlist entry not found." }, { status: 404 });
  }

  return NextResponse.json({ entry: data });
}
