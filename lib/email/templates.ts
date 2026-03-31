type TemplateData = Record<string, unknown>;

type TemplateOutput = {
  subject: string;
  text: string;
  ctaLabel: string;
  ctaUrl: string;
};

function str(value: unknown, fallback: string) {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  return fallback;
}

function appUrl(path: string) {
  const root = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${root}${path}`;
}

export const EMAIL_TEMPLATES: Record<string, (metadata: TemplateData) => TemplateOutput> = {
  campaign_invited: (metadata) => ({
    subject: "You've been invited to a campaign",
    text: [
      "You've been selected for a campaign on HILLink.",
      "",
      `Business: ${str(metadata.businessName, "Unknown business")}`,
      `Campaign: ${str(metadata.campaignTitle, "Untitled campaign")}`,
      `Payout: ${str(metadata.amountOrReward, "TBD")}`,
      `Spots Available: ${str(metadata.spotsRemaining, "Unknown")}`,
      "",
      "Review the details and claim your spot before it fills.",
    ].join("\n"),
    ctaLabel: "View Campaign",
    ctaUrl: appUrl("/athlete"),
  }),

  application_accepted: (metadata) => ({
    subject: "You're in - campaign approved",
    text: [
      "You've been approved for the campaign.",
      "",
      `Business: ${str(metadata.businessName, "Unknown business")}`,
      `Campaign: ${str(metadata.campaignTitle, "Untitled campaign")}`,
      "",
      "Next step: complete the deliverables outlined in your dashboard.",
      "",
      "Deadlines and requirements are now active.",
    ].join("\n"),
    ctaLabel: "Go to Dashboard",
    ctaUrl: appUrl("/athlete"),
  }),

  application_declined: (metadata) => ({
    subject: "Campaign update",
    text: [
      "Your application was not selected for this campaign.",
      "",
      `Campaign: ${str(metadata.campaignTitle, "Untitled campaign")}`,
      "",
      "Spots are limited, but new opportunities are posted regularly.",
    ].join("\n"),
    ctaLabel: "Browse Campaigns",
    ctaUrl: appUrl("/athlete"),
  }),

  payout_sent: (metadata) => ({
    subject: "Payout sent",
    text: [
      "Your payout has been processed.",
      "",
      `Campaign: ${str(metadata.campaignTitle, "Untitled campaign")}`,
      `Amount: ${str(metadata.amount, "TBD")}`,
      `Method: ${str(metadata.paymentMethod, "Stripe")}`,
      "",
      "Funds should arrive shortly depending on your payment provider.",
    ].join("\n"),
    ctaLabel: "View Details",
    ctaUrl: appUrl("/athlete"),
  }),

  verification_approved: () => ({
    subject: "You're verified",
    text: [
      "Your account has been verified.",
      "",
      "You now have access to higher-tier campaigns and increased earning potential.",
    ].join("\n"),
    ctaLabel: "View Opportunities",
    ctaUrl: appUrl("/athlete"),
  }),

  verification_rejected: (metadata) => ({
    subject: "Verification update",
    text: [
      "Your verification request was not approved.",
      "",
      `Reason: ${str(metadata.reason, "Not provided")}`,
      "",
      "You can resubmit with updated information.",
    ].join("\n"),
    ctaLabel: "Resubmit Verification",
    ctaUrl: appUrl("/settings"),
  }),

  campaign_cancelled: (metadata) => ({
    subject: "Campaign cancelled",
    text: [
      "This campaign has been cancelled by the business.",
      "",
      `Campaign: ${str(metadata.campaignTitle, "Untitled campaign")}`,
      "",
      "If you had already completed work, support will review your case.",
    ].join("\n"),
    ctaLabel: "Contact Support",
    ctaUrl: appUrl("/support"),
  }),

  campaign_completed: (metadata) => ({
    subject: "Campaign completed",
    text: [
      "This campaign has been marked as completed.",
      "",
      `Campaign: ${str(metadata.campaignTitle, "Untitled campaign")}`,
      "",
      "Check your dashboard for any final next steps.",
    ].join("\n"),
    ctaLabel: "View Dashboard",
    ctaUrl: appUrl("/athlete"),
  }),

  new_application: (metadata) => ({
    subject: "New athlete application",
    text: [
      "A new athlete has applied to your campaign.",
      "",
      `Athlete: ${str(metadata.athleteName, "Unknown athlete")}`,
      `School / Sport: ${str(metadata.schoolSport, "Not provided")}`,
      `Campaign: ${str(metadata.campaignTitle, "Untitled campaign")}`,
      "",
      "Review their profile and accept or decline.",
    ].join("\n"),
    ctaLabel: "Review Application",
    ctaUrl: appUrl("/business"),
  }),

  proof_approved: (metadata) => EMAIL_TEMPLATES.application_accepted(metadata),
  proof_rejected: (metadata) => EMAIL_TEMPLATES.application_declined(metadata),
  athlete_verification_approved: (metadata) => EMAIL_TEMPLATES.verification_approved(metadata),
  athlete_verification_rejected: (metadata) => EMAIL_TEMPLATES.verification_rejected(metadata),

  // Backward compatibility for the old key used elsewhere in this repo.
  campaign_invite: (metadata) => EMAIL_TEMPLATES.campaign_invited(metadata),
};
