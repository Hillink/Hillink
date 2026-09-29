// Compliance rules for who can work with whom. Pure, no imports, unit tested with `node --test`.
// The database enforces the same lists (supabase/migrations/20260928000300_compliance_and_automation.sql);
// keep them in sync.

export type BusinessCategory = { key: string; label: string; restrictedReason?: string };

export const BUSINESS_CATEGORIES: BusinessCategory[] = [
  { key: "restaurant", label: "Restaurant or food truck" },
  { key: "cafe_dessert", label: "Coffee, bakery or dessert" },
  { key: "fitness", label: "Gym, fitness or sports training" },
  { key: "beauty", label: "Salon, barber, spa or beauty" },
  { key: "apparel", label: "Clothing, shoes or apparel" },
  { key: "retail", label: "Other retail store" },
  { key: "beverages", label: "Drinks (non-alcoholic)" },
  { key: "banking", label: "Bank or credit union" },
  { key: "auto", label: "Car dealer or auto service" },
  { key: "telecom", label: "Phone or internet provider" },
  { key: "health", label: "Medical, dental or physical therapy" },
  { key: "education", label: "Tutoring or education" },
  { key: "housing", label: "Real estate or student housing" },
  { key: "entertainment", label: "Entertainment or events" },
  { key: "services", label: "Other local service" },
  { key: "other", label: "Something else" },
  // Not allowed: NCAA, state NIL laws and most school policies bar athletes from these.
  { key: "alcohol", label: "Bar, brewery or liquor store", restrictedReason: "Most state NIL laws and schools bar athletes from promoting alcohol." },
  { key: "tobacco_vape", label: "Tobacco or vape", restrictedReason: "State NIL laws bar athletes from promoting tobacco and vape products." },
  { key: "cannabis", label: "Cannabis, CBD or hemp", restrictedReason: "State NIL laws and the NCAA bar cannabis promotion, and CBD can risk eligibility." },
  { key: "gambling", label: "Betting, casino or sweepstakes", restrictedReason: "The NCAA and state laws bar athletes from promoting sports betting and gambling." },
  { key: "adult", label: "Adult entertainment", restrictedReason: "State NIL laws and schools bar athletes from adult entertainment deals." },
  { key: "firearms", label: "Firearms or weapons", restrictedReason: "Many state NIL laws and schools bar athletes from promoting firearms." },
  { key: "supplements", label: "Supplements or weight loss", restrictedReason: "Supplements can contain NCAA-banned substances and put an athlete's eligibility at risk." },
];

export const RESTRICTED_CATEGORY_KEYS = BUSINESS_CATEGORIES.filter((c) => c.restrictedReason).map((c) => c.key);
export const ALLOWED_CATEGORY_KEYS = BUSINESS_CATEGORIES.filter((c) => !c.restrictedReason).map((c) => c.key);

/** Categories a school might have an exclusive sponsor in (e.g. Nike for apparel, Coca-Cola for drinks). */
export const SCHOOL_CONFLICT_OPTIONS = BUSINESS_CATEGORIES.filter((c) => !c.restrictedReason && c.key !== "other");

export function categoryByKey(key: string | null | undefined): BusinessCategory | null {
  return BUSINESS_CATEGORIES.find((c) => c.key === key) ?? null;
}

export function isRestrictedCategory(key: string | null | undefined): boolean {
  return !!key && RESTRICTED_CATEGORY_KEYS.includes(key);
}

export type VisaStatus = "us_citizen_or_resident" | "international_cleared" | "international_not_cleared";

export type AthleteCompliance = {
  confirmed_adult: boolean | null;
  visa_status: VisaStatus | null;
  school_disclosure_ack: boolean | null;
  school_conflict_categories: string[] | null;
};

export type JoinBlock =
  | { code: "compliance_required"; message: string }
  | { code: "visa_not_cleared"; message: string }
  | { code: "business_restricted"; message: string }
  | { code: "school_conflict"; message: string };

/** Why an athlete can't join a business's campaign, or null if they can. Mirrors public.athlete_join_block(). */
export function joinBlock(athlete: AthleteCompliance | null, businessCategoryKey: string | null | undefined): JoinBlock | null {
  if (!athlete || !athlete.confirmed_adult || !athlete.visa_status || !athlete.school_disclosure_ack) {
    return { code: "compliance_required", message: "Confirm your eligibility (age, visa and school disclosure) before joining campaigns." };
  }
  if (athlete.visa_status === "international_not_cleared") {
    return {
      code: "visa_not_cleared",
      message: "Student visas usually don't allow paid NIL work in the US. Check with your school's international office, then update your eligibility.",
    };
  }
  if (isRestrictedCategory(businessCategoryKey)) {
    return { code: "business_restricted", message: "This business is in a category athletes can't promote." };
  }
  if (businessCategoryKey && (athlete.school_conflict_categories || []).includes(businessCategoryKey)) {
    return { code: "school_conflict", message: "Your school has an exclusive deal in this business's category, so you can't join this campaign." };
  }
  return null;
}

export function validateComplianceInput(input: Partial<AthleteCompliance>): { ok: true; value: AthleteCompliance } | { ok: false; error: string } {
  if (input.confirmed_adult !== true) return { ok: false, error: "You must be 18 or older to use Hillink." };
  const visa = input.visa_status;
  if (visa !== "us_citizen_or_resident" && visa !== "international_cleared" && visa !== "international_not_cleared") {
    return { ok: false, error: "Choose your visa status." };
  }
  if (input.school_disclosure_ack !== true) return { ok: false, error: "You must agree to disclose Hillink deals to your school." };
  const allowed = new Set(SCHOOL_CONFLICT_OPTIONS.map((c) => c.key));
  const conflicts = Array.from(new Set((input.school_conflict_categories || []).filter((k) => allowed.has(k))));
  return { ok: true, value: { confirmed_adult: true, visa_status: visa, school_disclosure_ack: true, school_conflict_categories: conflicts } };
}

// ----- Proof review automation -----

export const DEFAULT_REVIEW_WINDOW_HOURS = 72;

/**
 * The review window the server enforces. Businesses can write campaigns.review_window_hours directly,
 * so a stored value can only shorten the window, never stretch it past 72h and delay an athlete's
 * payout (BUS-002).
 */
export function effectiveReviewWindowHours(reviewWindowHours: number | null | undefined): number {
  const hours = Number(reviewWindowHours);
  if (!Number.isFinite(hours) || hours <= 0) return DEFAULT_REVIEW_WINDOW_HOURS;
  return Math.min(hours, DEFAULT_REVIEW_WINDOW_HOURS);
}

/** True once a submission has waited longer than the campaign's review window. */
export function isReviewOverdue(submittedAt: string | null | undefined, reviewWindowHours: number | null | undefined, now: Date): boolean {
  if (!submittedAt) return false;
  const submitted = Date.parse(submittedAt);
  if (!Number.isFinite(submitted)) return false;
  return now.getTime() - submitted >= effectiveReviewWindowHours(reviewWindowHours) * 3600_000;
}
