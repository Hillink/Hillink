export type CampaignTemplateKey =
  | "instagram_post"
  | "dine_and_post"
  | "product_review"
  | "monthly_ambassador";

export type ClaimMethod = "first_come_first_serve" | "business_selects";
export type LocationType = "local_only" | "shipped" | "hybrid";

export type BusinessAccessTier = "starter" | "growth" | "scale" | "domination";

export type CampaignContentFormat =
  | "feed_post"
  | "story"
  | "reel"
  | "carousel"
  | "combo"
  | "unboxing_video"
  | "product_review_video";

export const TEMPLATE_LABELS: Record<CampaignTemplateKey, string> = {
  instagram_post: "Instagram Post",
  dine_and_post: "Dine and Post",
  product_review: "Product Review / Unboxing",
  monthly_ambassador: "Monthly Ambassador",
};

export const CONTENT_FORMAT_LABELS: Record<CampaignContentFormat, string> = {
  feed_post: "Feed post",
  story: "Story",
  reel: "Reel",
  carousel: "Carousel",
  combo: "Combo (post + story)",
  unboxing_video: "Unboxing video",
  product_review_video: "Product review video",
};

export const TEMPLATE_FORMAT_OPTIONS: Record<CampaignTemplateKey, CampaignContentFormat[]> = {
  instagram_post: ["feed_post", "story", "reel", "carousel"],
  dine_and_post: ["feed_post", "story", "reel", "combo"],
  product_review: ["feed_post", "story", "reel", "unboxing_video", "product_review_video"],
  monthly_ambassador: ["feed_post", "story", "reel", "carousel", "combo"],
};

export const TEMPLATE_PROOF_REQUIREMENTS: Record<CampaignTemplateKey, string[]> = {
  instagram_post: [
    "Live post URL",
    "Screenshot of live content",
    "Screenshot showing required tags or mentions",
  ],
  dine_and_post: [
    "Photo or screenshot of visit confirmation",
    "Live post URL",
    "Screenshot of live content",
  ],
  product_review: [
    "Delivery or pickup confirmation",
    "Live content URL",
    "Screenshot of live content",
  ],
  monthly_ambassador: [
    "Live content URL for each deliverable",
    "Screenshot for each deliverable",
    "Optional referral code usage screenshot",
  ],
};

export const TEMPLATE_CLAIM_METHOD_OPTIONS: Record<CampaignTemplateKey, ClaimMethod[]> = {
  instagram_post: ["first_come_first_serve", "business_selects"],
  dine_and_post: ["first_come_first_serve", "business_selects"],
  product_review: ["business_selects", "first_come_first_serve"],
  monthly_ambassador: ["business_selects"],
};

export const TEMPLATE_DEFAULT_COMPLETION_DAYS: Record<CampaignTemplateKey, number> = {
  instagram_post: 3,
  dine_and_post: 3,
  product_review: 7,
  monthly_ambassador: 30,
};

export function defaultClaimMethod(template: CampaignTemplateKey, tier: BusinessAccessTier): ClaimMethod {
  if (template === "monthly_ambassador") return "business_selects";
  if (template === "product_review") return tier === "starter" ? "first_come_first_serve" : "business_selects";
  if (template === "instagram_post" || template === "dine_and_post") {
    return tier === "starter" ? "first_come_first_serve" : "business_selects";
  }
  return "first_come_first_serve";
}

export function defaultLocationType(template: CampaignTemplateKey): LocationType {
  if (template === "product_review") return "shipped";
  return "local_only";
}

export function campaignTemplateSummary(template: CampaignTemplateKey, config: Record<string, unknown>) {
  const format = typeof config.content_format === "string" ? config.content_format : "";
  const posts = Number(config.number_of_posts || 1);
  const deadline = Number(config.posting_deadline_days_after_claim || config.posting_deadline_days_after_visit || config.posting_deadline_days_after_receipt || 3);
  return {
    formatLabel: CONTENT_FORMAT_LABELS[format as CampaignContentFormat] || "Content",
    posts,
    deadline,
    claimMethod: String(config.claim_method || "first_come_first_serve"),
    templateLabel: TEMPLATE_LABELS[template],
  };
}
