import { createAdminClient } from "@/lib/supabase/admin";
import { isValidResendKey } from "@/lib/env/validation";
import { EMAIL_TEMPLATES } from "@/lib/email/templates";

export type NotificationType =
  | "application_accepted"
  | "application_declined"
  | "proof_approved"
  | "proof_rejected"
  | "new_application"
  | "proof_submitted"
  | "challenge_completed"
  | "xp_earned"
  | "campaign_invited"
  | "campaign_invite"
  | "admin_broadcast"
  | "campaign_cancelled"
  | "campaign_completed"
  | "payout_sent"
  | "verification_approved"
  | "verification_rejected"
  | "athlete_verification_approved"
  | "athlete_verification_rejected"
  | "deliverable_submitted"
  | "deliverable_reviewed"
  | "dispute_opened"
  | "dispute_resolved";

type NotificationMetadata = Record<string, unknown>;

export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  ctaUrl?: string | null;
  ctaLabel?: string | null;
  metadata?: NotificationMetadata;
}): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const insertFull = async (type: NotificationType) => {
      return await admin
        .from("notifications")
        .insert({
          user_id: params.userId,
          type,
          title: params.title,
          body: params.body,
          cta_label: params.ctaLabel ?? null,
          cta_url: params.ctaUrl ?? null,
          metadata: params.metadata ?? null,
        })
        .select("id")
        .single();
    };

    const insertLegacy = async (type: NotificationType, metadata: NotificationMetadata | null) => {
      return await admin
        .from("notifications")
        .insert({
          user_id: params.userId,
          type,
          title: params.title,
          body: params.body,
          metadata,
        })
        .select("id")
        .single();
    };

    let { data, error } = await insertFull(params.type);

    // Older DBs may not have CTA columns yet.
    if (error && /column .* does not exist/i.test(error.message)) {
      const legacyRes = await insertLegacy(params.type, params.metadata ?? null);
      data = legacyRes.data;
      error = legacyRes.error;
    }

    // Older check constraints may not include newer types like admin_broadcast.
    if (error && /check constraint|notifications_type_check/i.test(error.message)) {
      const fallbackMeta: NotificationMetadata = {
        ...(params.metadata ?? {}),
        original_type: params.type,
      };

      const retry = await insertLegacy("new_application", fallbackMeta);
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error("createNotification failed", {
        userId: params.userId,
        type: params.type,
        message: error.message,
      });
      return null;
    }

    return data?.id ?? null;
  } catch {
    return null;
  }
}

export async function sendNotificationEmail(params: {
  to: string;
  subject: string;
  text: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
}): Promise<{ sent: boolean }> {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.NOTIFICATIONS_FROM_EMAIL || "no-reply@hillink.io";

    if (!isValidResendKey(apiKey)) {
      return { sent: false };
    }

    const suffix = params.ctaLabel && params.ctaUrl ? `\n\n${params.ctaLabel}: ${params.ctaUrl}` : "";
    const text = `${params.text}${suffix}`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [params.to],
        subject: params.subject,
        text,
      }),
    });

    return { sent: res.ok };
  } catch {
    return { sent: false };
  }
}

export async function notifyUser(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  metadata?: NotificationMetadata;
  email?: { to: string };
}): Promise<void> {
  try {
    const notificationId = await createNotification({
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      ctaLabel: params.ctaLabel,
      ctaUrl: params.ctaUrl,
      metadata: params.metadata,
    });

    if (!params.email?.to) {
      return;
    }

    const template = EMAIL_TEMPLATES[params.type];
    let subject = params.title;
    let text = params.body;
    let ctaLabel = params.ctaLabel || "";
    let ctaUrl = params.ctaUrl || "";

    if (template) {
      const generated = template(params.metadata || {});
      subject = generated.subject;
      text = generated.text;
      ctaLabel = generated.ctaLabel;
      ctaUrl = generated.ctaUrl;
    }

    const emailRes = await sendNotificationEmail({
      to: params.email.to,
      subject,
      text,
      ctaLabel,
      ctaUrl,
    });

    if (!emailRes.sent || !notificationId) {
      return;
    }

    const admin = createAdminClient();
    await admin
      .from("notifications")
      .update({
        email_sent: true,
        email_sent_at: new Date().toISOString(),
      })
      .eq("id", notificationId);
  } catch {
    // Never throw from notification path.
  }
}
