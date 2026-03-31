import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/rbac";
import { createServerClient } from "@/lib/supabase-server";
import { createNotification } from "@/lib/notifications";

type TargetRole = "athlete" | "business" | "both";

type BroadcastBody = {
  title?: unknown;
  body?: unknown;
  targetRole?: unknown;
  ctaUrl?: unknown;
  ctaLabel?: unknown;
};

type ProfileRecipient = {
  id: string;
};

const MAX_RECIPIENTS = 1000;

export async function POST(req: NextRequest) {
  const authResult = await requireRole(req, ["admin"]);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  let payload: BroadcastBody;
  try {
    payload = (await req.json()) as BroadcastBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  const targetRole = payload.targetRole as TargetRole;
  const ctaUrl = typeof payload.ctaUrl === "string" && payload.ctaUrl.trim().length > 0 ? payload.ctaUrl.trim() : undefined;
  const ctaLabel = typeof payload.ctaLabel === "string" && payload.ctaLabel.trim().length > 0 ? payload.ctaLabel.trim() : undefined;

  if (!title || !body) {
    return NextResponse.json({ error: "title and body are required" }, { status: 422 });
  }

  if (targetRole !== "athlete" && targetRole !== "business" && targetRole !== "both") {
    return NextResponse.json({ error: "Invalid targetRole" }, { status: 422 });
  }

  const supabase = await createServerClient();
  const recipientsQuery = supabase.from("profiles").select("id");
  const recipientFilter =
    targetRole === "both"
      ? recipientsQuery.in("role", ["athlete", "business"])
      : recipientsQuery.eq("role", targetRole);

  const { data: recipients, error: recipientsError } = await recipientFilter;

  if (recipientsError) {
    return NextResponse.json({ error: "Failed to load recipients" }, { status: 500 });
  }

  const recipientRows = (recipients ?? []) as ProfileRecipient[];
  if (recipientRows.length > MAX_RECIPIENTS) {
    return NextResponse.json(
      { error: "Too many recipients, use a more specific target" },
      { status: 422 }
    );
  }

  const settled = await Promise.allSettled(
    recipientRows.map(async (recipient) => {
      const id = await createNotification({
        userId: recipient.id,
        type: "admin_broadcast",
        title,
        body,
        ctaUrl,
        ctaLabel,
      });

      if (!id) {
        throw new Error("insert_failed");
      }

      return id;
    })
  );

  let sent = 0;
  let failed = 0;

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      sent += 1;
      return;
    }

    failed += 1;
    const failedUserId = recipientRows[index]?.id;
    console.error("Broadcast notification failed", {
      userId: failedUserId,
      reason: result.reason,
    });
  });

  return NextResponse.json(
    {
      sent,
      failed,
      warning:
        failed > 0
          ? "Some notifications failed to insert. Verify notifications schema migrations are applied."
          : null,
    },
    { status: 200 }
  );
}
