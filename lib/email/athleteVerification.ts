import { isValidResendKey } from "@/lib/env/validation";

export async function sendAthleteVerificationEmail(params: {
  to: string;
  status: "approved" | "rejected" | "pending";
  reason?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.NOTIFICATIONS_FROM_EMAIL || "no-reply@hillink.io";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!isValidResendKey(apiKey)) {
    return { sent: false, reason: "RESEND_API_KEY is missing or placeholder" };
  }

  const statusText =
    params.status === "approved"
      ? "approved"
      : params.status === "rejected"
      ? "rejected"
      : "updated";

  const actionLine =
    params.status === "approved"
      ? `You can now access the athlete portal: ${appUrl}/athlete`
      : params.status === "rejected"
      ? `You can update your profile and re-apply here: ${appUrl}/onboarding/athlete`
      : `Check your account status here: ${appUrl}/athlete/pending`;

  const subject = `HILLink athlete verification ${statusText}`;

  const text = [
    `Your athlete verification has been ${statusText}.`,
    params.status === "rejected" && params.reason ? `Reason: ${params.reason}` : null,
    "",
    actionLine,
    "",
    "If you have questions, reply to this email.",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [params.to],
      subject,
      text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    return { sent: false, reason: body || "email provider error" };
  }

  return { sent: true };
}
