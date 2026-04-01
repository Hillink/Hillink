"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getTierFromXp, type AthleteTier } from "@/lib/xp";
import { formatMilesLabel, locationKey, milesBetween, storedCoords, type LatLng } from "@/lib/location";
import NotificationBell from "@/components/NotificationBell";
import {
  CONTENT_FORMAT_LABELS,
  TEMPLATE_CLAIM_METHOD_OPTIONS,
  TEMPLATE_DEFAULT_COMPLETION_DAYS,
  TEMPLATE_FORMAT_OPTIONS,
  TEMPLATE_LABELS,
  TEMPLATE_PROOF_REQUIREMENTS,
  defaultClaimMethod,
  defaultLocationType,
  type BusinessAccessTier,
  type CampaignContentFormat,
  type CampaignTemplateKey,
  type ClaimMethod,
  type LocationType,
} from "@/lib/campaignTemplates";

type Campaign = {
  id: string;
  title: string;
  campaign_type: "basic_post" | "story_pack" | "reel_boost" | "event_appearance" | "brand_ambassador";
  deliverables: string;
  campaign_template?: CampaignTemplateKey | null;
  campaign_objective?: string | null;
  claim_method?: ClaimMethod | null;
  completion_window_days?: number | null;
  review_window_hours?: number | null;
  location_type?: LocationType | null;
  eligible_athlete_tiers?: string[] | null;
  proof_requirements?: string[] | null;
  template_config?: Record<string, unknown> | null;
  additional_compensation: string | null;
  preferred_tier: "Bronze" | "Silver" | "Gold" | "Platinum" | "Diamond" | "Any";
  payout_cents: number;
  start_date: string | null;
  slots: number;
  open_slots: number;
  location_text: string | null;
  due_date: string | null;
  status: "draft" | "active" | "paused" | "completed" | "cancelled" | "open" | "closed";
  created_at: string;
};

type Application = {
  id: string;
  campaign_id: string;
  athlete_id: string;
  status: "applied" | "accepted" | "declined" | "withdrawn" | "submitted" | "approved" | "rejected";
  proof_url: string | null;
  proof_notes: string | null;
  applied_at: string;
  submitted_at: string | null;
};

type InstagramDiagnostics = {
  application_id: string;
  likes: number;
  comments: number;
  saves: number;
  reach: number;
  impressions: number;
  video_views: number;
  diagnostics_status: string;
  diagnostics_notes: string | null;
  last_synced_at: string | null;
};

type AthleteProfile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  school: string | null;
  sport: string | null;
  city: string | null;
  state: string | null;
  latitude?: number | null;
  longitude?: number | null;
  minimum_payout: string | null;
  instagram: string | null;
  deal_types: string | null;
  preferred_company_type: string | null;
  bio: string | null;
  average_rating?: number | null;
  total_ratings?: number | null;
  profile_photo_url?: string | null;
};

type BusinessBillingProfile = {
  subscription_tier: "starter" | "growth" | "scale" | "domination";
  access_tier_override?: "starter" | "growth" | "scale" | "domination" | null;
  subscription_status: "inactive" | "active" | "past_due" | "cancelled";
  monthly_price_cents?: number;
  billing_city?: string | null;
  billing_state?: string | null;
  max_slots_per_campaign: number;
  max_open_campaigns: number;
  max_athlete_tier: AthleteTier;
  billing_ready: boolean;
};

type CampaignTemplate = {
  id: string;
  name: string;
  createdAt: string;
  config: {
    template: CampaignTemplateKey;
    campaignType: Campaign["campaign_type"];
    objective: string;
    shortDescription: string;
    claimMethod: ClaimMethod;
    contentFormat: CampaignContentFormat;
    numberOfPosts: number;
    postingDeadlineDays: number;
    locationType: LocationType;
    proofRequirements: string[];
    eligibleAthleteTiers: AthleteTier[];
    termsAccepted: boolean;
    prohibitedAcknowledged: boolean;
    additionalCompensation: string;
    tier: Campaign["preferred_tier"];
    slots: number;
    payoutCents: number;
    locationText: string;
    directions: string;
    claimWindowDays: 3 | 5 | 7;
    completionWindowDays: number;
  };
};

const tierOrder: Record<AthleteTier, number> = {
  Bronze: 1,
  Silver: 2,
  Gold: 3,
  Platinum: 4,
  Diamond: 5,
};

const tierCampaignTemplates: Record<BusinessAccessTier, CampaignTemplateKey[]> = {
  starter: ["instagram_post", "dine_and_post"],
  growth: ["instagram_post", "dine_and_post", "product_review"],
  scale: ["instagram_post", "dine_and_post", "product_review", "monthly_ambassador"],
  domination: ["instagram_post", "dine_and_post", "product_review", "monthly_ambassador"],
};

const templateCampaignType: Record<CampaignTemplateKey, Campaign["campaign_type"]> = {
  instagram_post: "basic_post",
  dine_and_post: "story_pack",
  product_review: "reel_boost",
  monthly_ambassador: "brand_ambassador",
};

const tierDisplayName: Record<"starter" | "growth" | "scale" | "domination", string> = {
  starter: "Starter",
  growth: "Growth",
  scale: "Scale",
  domination: "Domination",
};

const campaignTypeLabel: Record<Campaign["campaign_type"], string> = {
  basic_post: "Instagram Post Promotion",
  story_pack: "Instagram Story Package",
  reel_boost: "Reel Boost Campaign",
  event_appearance: "In-Person Event Appearance",
  brand_ambassador: "Brand Ambassador Series",
};

const claimMethodLabel: Record<ClaimMethod, string> = {
  first_come_first_serve: "First come, first serve",
  business_selects: "Business selects",
};

function campaignTemplateLabel(campaign: Campaign): string {
  if (campaign.campaign_template && TEMPLATE_LABELS[campaign.campaign_template]) {
    return TEMPLATE_LABELS[campaign.campaign_template];
  }
  return campaignTypeLabel[campaign.campaign_type];
}

const TEMPLATE_COMPLETION_DAY_OPTIONS: Record<CampaignTemplateKey, number[]> = {
  instagram_post: [2, 3, 5],
  dine_and_post: [2, 3, 5],
  product_review: [5, 7, 10],
  monthly_ambassador: [30],
};

function canAccessTier(currentMax: AthleteTier, requested: AthleteTier) {
  return tierOrder[requested] <= tierOrder[currentMax];
}

function fullName(a: AthleteProfile | undefined): string {
  if (!a) return "Unknown Athlete";
  const value = `${a.first_name || ""} ${a.last_name || ""}`.trim();
  return value || "Unnamed Athlete";
}

function statusLabel(status: Application["status"]) {
  if (status === "applied") return "Applied";
  if (status === "accepted") return "Accepted";
  if (status === "submitted") return "Submitted Proof";
  if (status === "approved") return "Approved";
  if (status === "declined") return "Declined";
  if (status === "rejected") return "Rejected";
  return "Withdrawn";
}

function diagnosticsTone(status: InstagramDiagnostics["diagnostics_status"]) {
  if (status === "verified") return { color: "#0a7f2e", bg: "#e7f8ee" };
  if (status === "mock" || status === "missing_connection") return { color: "#8a5a00", bg: "#fff6e5" };
  if (status === "unverified") return { color: "#8a5a00", bg: "#fff3d6" };
  return { color: "#9b1c1c", bg: "#ffe8e8" };
}

export default function BusinessDashboard() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authError, setAuthError] = useState("");
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [billingProfile, setBillingProfile] = useState<BusinessBillingProfile | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [athletesById, setAthletesById] = useState<Record<string, AthleteProfile>>({});
  const [athleteTierById, setAthleteTierById] = useState<Record<string, AthleteTier>>({});
  const [athleteXpById, setAthleteXpById] = useState<Record<string, number>>({});
  const [diagnosticsByApplicationId, setDiagnosticsByApplicationId] = useState<Record<string, InstagramDiagnostics>>({});
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [syncingDiagnosticsId, setSyncingDiagnosticsId] = useState<string | null>(null);
  const [syncingCampaignDiagnosticsId, setSyncingCampaignDiagnosticsId] = useState<string | null>(null);
  const [removingAthleteId, setRemovingAthleteId] = useState<string | null>(null);
  const [cancellingCampaignId, setCancellingCampaignId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [campaignError, setCampaignError] = useState("");
  const [creating, setCreating] = useState(false);
  const [ratingModal, setRatingModal] = useState<{ applicationId: string; athleteName: string } | null>(null);
  const [ratingStars, setRatingStars] = useState(5);
  const [ratingReview, setRatingReview] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);
  const [profileModalAthleteId, setProfileModalAthleteId] = useState<string | null>(null);
  const [expandedCampaignAthleteId, setExpandedCampaignAthleteId] = useState<string | null>(null);
  const [allAthletes, setAllAthletes] = useState<AthleteProfile[]>([]);
  const [businessId, setBusinessId] = useState<string>("");
  const [templates, setTemplates] = useState<CampaignTemplate[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [allAthletesXp, setAllAthletesXp] = useState<Record<string, number>>({});
  const [allAthletesLoaded, setAllAthletesLoaded] = useState(false);
  const [loadingAthletes, setLoadingAthletes] = useState(false);
  const [afSearch, setAfSearch] = useState("");
  const [afTier, setAfTier] = useState("");
  const [afDealType, setAfDealType] = useState("");
  const [afState, setAfState] = useState("");
  const [afMaxPayout, setAfMaxPayout] = useState("");
  const [afRadiusMiles, setAfRadiusMiles] = useState("");
  const [afCenterCity, setAfCenterCity] = useState("");
  const [afCenterState, setAfCenterState] = useState("");
  const [afSort, setAfSort] = useState("nearest");
  const [afCenterCoords, setAfCenterCoords] = useState<LatLng | null>(null);

  const locationCoords = useMemo(() => {
    const next: Record<string, LatLng | null> = {};
    for (const athlete of allAthletes) {
      const key = locationKey(athlete.city, athlete.state);
      if (!key) continue;
      const coords = storedCoords(athlete.latitude, athlete.longitude);
      if (coords) next[key] = coords;
    }
    return next;
  }, [allAthletes]);

  const [form, setForm] = useState({
    template: "instagram_post" as CampaignTemplateKey,
    title: "",
    shortDescription: "",
    objective: "",
    campaignType: "basic_post" as Campaign["campaign_type"],
    claimMethod: "first_come_first_serve" as ClaimMethod,
    contentFormat: "feed_post" as CampaignContentFormat,
    numberOfPosts: 1,
    postingDeadlineDays: 3,
    locationType: "local_only" as LocationType,
    proofRequirements: [...TEMPLATE_PROOF_REQUIREMENTS.instagram_post],
    eligibleAthleteTiers: ["Bronze", "Silver", "Gold", "Platinum", "Diamond"] as AthleteTier[],
    termsAccepted: false,
    prohibitedAcknowledged: false,
    additionalCompensation: "",
    tier: "Silver" as Campaign["preferred_tier"],
    slots: 2,
    payoutCents: 6500,
    locationText: "",
    directions: "",
    claimWindowDays: 5 as 3 | 5 | 7,
    completionWindowDays: 3,
  });

    const templateStorageKey = businessId ? `hillink:campaign-templates:${businessId}` : "";

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }

  const loadData = async () => {
    setError("");
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;

    if (!user) {
      router.push("/login");
      return;
    }

    setBusinessId(user.id);

    const { data: roleProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!roleProfile) {
      setError("Unable to verify your account role right now.");
      setLoading(false);
      return;
    }

    if (roleProfile.role !== "business") {
      router.push("/role-redirect");
      return;
    }

    const { data: billingData } = await supabase
      .from("business_billing_profiles")
      .select("subscription_tier, access_tier_override, subscription_status, monthly_price_cents, billing_city, billing_state, max_slots_per_campaign, max_open_campaigns, max_athlete_tier, billing_ready")
      .eq("business_id", user.id)
      .single();

    setBillingProfile((billingData || null) as BusinessBillingProfile | null);
    if (billingData?.billing_city && !afCenterCity) setAfCenterCity(billingData.billing_city);
    if (billingData?.billing_state && !afCenterState) setAfCenterState(billingData.billing_state);

    const { data: campaignRows, error: campaignError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("business_id", user.id)
      .order("created_at", { ascending: false });

    if (campaignError) {
      setError(campaignError.message);
      setLoading(false);
      return;
    }

    const loadedCampaigns = (campaignRows || []) as Campaign[];
    setCampaigns(loadedCampaigns);

    // Auto-accept pending athletes on campaigns whose start date has arrived
    const hasStartedCampaigns = loadedCampaigns.some(
      (c) => (c.status === "active" || c.status === "open") && c.start_date && c.start_date <= new Date().toISOString().slice(0, 10)
    );
    if (hasStartedCampaigns) {
      const autoRes = await fetch("/api/campaigns/auto-accept-started", { method: "POST" });
      if (autoRes.ok) {
        const autoData = (await autoRes.json()) as { accepted?: number };
        if ((autoData.accepted ?? 0) > 0) {
          // Re-fetch campaigns + applications to reflect newly accepted athletes
          const { data: refreshedRows } = await supabase
            .from("campaigns")
            .select("*")
            .eq("business_id", user.id)
            .order("created_at", { ascending: false });
          if (refreshedRows) setCampaigns(refreshedRows as Campaign[]);
        }
      }
    }

    if (!loadedCampaigns.length) {
      setApplications([]);
      setAthletesById({});
      setAthleteTierById({});
      setAthleteXpById({});
      setDiagnosticsByApplicationId({});
      setLoading(false);
      return;
    }

    const campaignIds = loadedCampaigns.map((c) => c.id);

    const { data: appRows, error: appError } = await supabase
      .from("campaign_applications")
      .select("id, campaign_id, athlete_id, status, proof_url, proof_notes, applied_at, submitted_at")
      .in("campaign_id", campaignIds)
      .order("applied_at", { ascending: false });

    if (appError) {
      setError(appError.message);
      setLoading(false);
      return;
    }

    const loadedApps = (appRows || []) as Application[];
    setApplications(loadedApps);

    if (loadedApps.length) {
      const { data: diagnosticsRows, error: diagnosticsError } = await supabase
        .from("instagram_post_diagnostics")
        .select("application_id, likes, comments, saves, reach, impressions, video_views, diagnostics_status, diagnostics_notes, last_synced_at")
        .in("application_id", loadedApps.map((a) => a.id));

      if (diagnosticsError && !diagnosticsError.message.toLowerCase().includes("instagram_post_diagnostics")) {
        setError(diagnosticsError.message);
        setLoading(false);
        return;
      }

      const nextDiagnostics: Record<string, InstagramDiagnostics> = {};
      for (const row of (diagnosticsRows || []) as InstagramDiagnostics[]) {
        nextDiagnostics[row.application_id] = row;
      }
      setDiagnosticsByApplicationId(nextDiagnostics);
    } else {
      setDiagnosticsByApplicationId({});
    }

    const athleteIds = Array.from(new Set(loadedApps.map((a) => a.athlete_id)));
    if (!athleteIds.length) {
      setAthletesById({});
      setAthleteTierById({});
      setAthleteXpById({});
      setLoading(false);
      return;
    }

    const { data: athleteRows, error: athleteError } = await supabase
      .from("athlete_profiles")
      .select("*")
      .in("id", athleteIds);

    if (athleteError) {
      setError(athleteError.message);
      setLoading(false);
      return;
    }

    const nextAthletes: Record<string, AthleteProfile> = {};
    for (const row of athleteRows || []) {
      const profile = row as AthleteProfile;
      nextAthletes[profile.id] = profile;
    }
    setAthletesById(nextAthletes);

    const { data: xpRows, error: xpError } = await supabase
      .from("athlete_xp_events")
      .select("athlete_id, xp_delta")
      .in("athlete_id", athleteIds);

    if (xpError && !xpError.message.toLowerCase().includes("athlete_xp_events")) {
      setError(xpError.message);
      setLoading(false);
      return;
    }

    const xpByAthlete: Record<string, number> = {};
    for (const id of athleteIds) xpByAthlete[id] = 0;
    for (const row of xpRows || []) {
      const athleteId = (row as { athlete_id: string; xp_delta: number }).athlete_id;
      const delta = (row as { athlete_id: string; xp_delta: number }).xp_delta || 0;
      xpByAthlete[athleteId] = (xpByAthlete[athleteId] || 0) + delta;
    }

    const tiers: Record<string, AthleteTier> = {};
    for (const id of athleteIds) {
      tiers[id] = getTierFromXp(xpByAthlete[id] || 0);
    }

    setAthleteXpById(xpByAthlete);
    setAthleteTierById(tiers);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadData();
    }, 20000);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        loadData();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const handleLogout = async () => {
    setAuthError("");
    setSignOutLoading(true);
    const { error: signOutError } = await supabase.auth.signOut();
    setSignOutLoading(false);
    if (signOutError) {
      setAuthError(signOutError.message);
      return;
    }
    router.push("/");
  };

  const submitCampaign = async () => {
    setCampaignError("");

    if (!form.title.trim()) {
      const message = "Campaign title is required.";
      setError(message);
      setCampaignError(message);
      return;
    }

    if (!form.shortDescription.trim()) {
      const message = "Short description is required.";
      setError(message);
      setCampaignError(message);
      return;
    }

    if (!form.objective.trim()) {
      const message = "Campaign objective is required.";
      setError(message);
      setCampaignError(message);
      return;
    }

    if (!form.directions.trim()) {
      const message = "Directions for athletes are required.";
      setError(message);
      setCampaignError(message);
      return;
    }

    if (!form.termsAccepted || !form.prohibitedAcknowledged) {
      const message = "You must acknowledge campaign terms and prohibited categories before publishing.";
      setError(message);
      setCampaignError(message);
      return;
    }

    if (!form.eligibleAthleteTiers.length) {
      const message = "Select at least one eligible athlete tier.";
      setError(message);
      setCampaignError(message);
      return;
    }

    if (!billingProfile || !billingProfile.billing_ready || billingProfile.subscription_status !== "active") {
      const message = "Complete billing setup and activate a subscription tier in Settings before posting campaigns.";
      setError(message);
      setCampaignError(message);
      return;
    }

    const activeOpenCampaigns = campaigns.filter((c) => c.status === "active" || c.status === "open").length;
    if (activeOpenCampaigns >= billingProfile.max_open_campaigns) {
      const message = `Your plan allows up to ${billingProfile.max_open_campaigns} open campaign(s).`;
      setError(message);
      setCampaignError(message);
      return;
    }

    if (form.slots > billingProfile.max_slots_per_campaign) {
      const message = `Your plan allows up to ${billingProfile.max_slots_per_campaign} athlete slot(s) per campaign.`;
      setError(message);
      setCampaignError(message);
      return;
    }

    if (form.tier !== "Any" && !canAccessTier(billingProfile.max_athlete_tier, form.tier as AthleteTier)) {
      const message = `Your plan supports up to ${billingProfile.max_athlete_tier} athletes.`;
      setError(message);
      setCampaignError(message);
      return;
    }

    const effectiveAccessTier = (billingProfile.access_tier_override || billingProfile.subscription_tier) as BusinessAccessTier;
    if (!tierCampaignTemplates[effectiveAccessTier].includes(form.template)) {
      const message = "Your selected campaign template is not available on your current plan tier.";
      setError(message);
      setCampaignError(message);
      return;
    }

    if (!TEMPLATE_CLAIM_METHOD_OPTIONS[form.template].includes(form.claimMethod)) {
      const message = "This template does not allow the selected claim method.";
      setError(message);
      setCampaignError(message);
      return;
    }

    setCreating(true);
    setError("");

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setCreating(false);
      router.push("/login");
      return;
    }

    const normalizedLocationInput = form.locationText.trim();
    const normalizedLocation = /online|remote/i.test(normalizedLocationInput)
      ? "Remote"
      : (normalizedLocationInput || null);

      // Compute campaign timeline from structured windows
      const now = new Date();
      const claimClose = new Date(now);
      claimClose.setDate(claimClose.getDate() + form.claimWindowDays);
      const athleteDue = new Date(claimClose);
      athleteDue.setDate(athleteDue.getDate() + form.postingDeadlineDays);
      const computedStartDate = now.toISOString().split("T")[0];
      const computedDueDate = athleteDue.toISOString().split("T")[0];

    const campaignType = templateCampaignType[form.template];
    const templateConfig = {
      short_description: form.shortDescription.trim(),
      campaign_objective: form.objective.trim(),
      platform: "instagram",
      claim_method: form.claimMethod,
      content_format: form.contentFormat,
      number_of_posts: form.numberOfPosts,
      posting_deadline_days_after_claim: form.postingDeadlineDays,
      content_guidelines: form.directions.trim(),
      proof_requirements: form.proofRequirements,
      location_type: form.locationType,
      completion_window_days: form.completionWindowDays,
    } as Record<string, unknown>;

    const baseCampaignInsert = {
      business_id: auth.user.id,
      title: form.title.trim(),
      campaign_type: campaignType,
      campaign_template: form.template,
      campaign_objective: form.objective.trim(),
      claim_method: form.claimMethod,
      completion_window_days: form.completionWindowDays,
      review_window_hours: 48,
      location_type: form.locationType,
      eligible_athlete_tiers: form.eligibleAthleteTiers,
      proof_requirements: form.proofRequirements,
      template_config: templateConfig,
      deliverables: form.directions.trim(),
      preferred_tier: form.tier,
      payout_cents: form.payoutCents,
      start_date: computedStartDate,
      slots: form.slots,
      open_slots: form.slots,
      location_text: normalizedLocation,
      due_date: computedDueDate,
      auto_accept_enabled: form.claimMethod === "first_come_first_serve",
      status: "active",
    };

    let insertError: { message: string } | null = null;
    const withCompensation = {
      ...baseCampaignInsert,
      additional_compensation: form.additionalCompensation.trim() || null,
    };

    const firstInsert = await supabase.from("campaigns").insert(withCompensation);
    insertError = firstInsert.error as { message: string } | null;

    if (insertError && insertError.message.includes("additional_compensation")) {
      const fallbackInsert = await supabase.from("campaigns").insert(baseCampaignInsert);
      insertError = fallbackInsert.error as { message: string } | null;
      if (!insertError) {
        setError("Campaign created. Note: additional compensation field is not in your database yet. Run supabase/campaign-details.sql to enable it.");
      }
    }

    setCreating(false);

    if (insertError) {
      setError(insertError.message);
      setCampaignError(insertError.message);
      return;
    }

    setCampaignError("");
    setShowModal(false);
    setForm({
      template: "instagram_post",
      title: "",
      shortDescription: "",
      objective: "",
      campaignType: "basic_post",
      claimMethod: defaultClaimMethod("instagram_post", effectiveAccessTier),
      contentFormat: "feed_post",
      numberOfPosts: 1,
      postingDeadlineDays: 3,
      locationType: defaultLocationType("instagram_post"),
      proofRequirements: [...TEMPLATE_PROOF_REQUIREMENTS.instagram_post],
      eligibleAthleteTiers: ["Bronze", "Silver", "Gold", "Platinum", "Diamond"],
      termsAccepted: false,
      prohibitedAcknowledged: false,
      additionalCompensation: "",
      tier: "Silver",
      slots: 2,
      payoutCents: 6500,
      locationText: "",
      directions: "",
      claimWindowDays: 5,
      completionWindowDays: TEMPLATE_DEFAULT_COMPLETION_DAYS.instagram_post,
    });
    await loadData();
  };

  useEffect(() => {
    if (!templateStorageKey) return;
    try {
      const raw = localStorage.getItem(templateStorageKey);
      if (!raw) {
        setTemplates([]);
        return;
      }
      const parsed = JSON.parse(raw) as CampaignTemplate[];
      setTemplates(Array.isArray(parsed) ? parsed : []);
    } catch {
      setTemplates([]);
    }
  }, [templateStorageKey]);

  const persistTemplates = (next: CampaignTemplate[]) => {
    setTemplates(next);
    if (!templateStorageKey) return;
    localStorage.setItem(templateStorageKey, JSON.stringify(next));
  };

  const saveTemplate = () => {
    const trimmed = templateName.trim();
    if (!trimmed) {
      setCampaignError("Add a template name before saving.");
      return;
    }
    const template: CampaignTemplate = {
      id: `${Date.now()}`,
      name: trimmed,
      createdAt: new Date().toISOString(),
      config: {
        template: form.template,
        campaignType: form.campaignType,
        objective: form.objective,
        shortDescription: form.shortDescription,
        claimMethod: form.claimMethod,
        contentFormat: form.contentFormat,
        numberOfPosts: form.numberOfPosts,
        postingDeadlineDays: form.postingDeadlineDays,
        locationType: form.locationType,
        proofRequirements: form.proofRequirements,
        eligibleAthleteTiers: form.eligibleAthleteTiers,
        termsAccepted: form.termsAccepted,
        prohibitedAcknowledged: form.prohibitedAcknowledged,
        additionalCompensation: form.additionalCompensation,
        tier: form.tier,
        slots: form.slots,
        payoutCents: form.payoutCents,
        locationText: form.locationText,
        directions: form.directions,
        claimWindowDays: form.claimWindowDays,
        completionWindowDays: form.completionWindowDays,
      },
    };

    const filtered = templates.filter((t) => t.name.toLowerCase() !== trimmed.toLowerCase());
    const next = [template, ...filtered].slice(0, 12);
    persistTemplates(next);
    setSelectedTemplateId(template.id);
    setCampaignError("");
    setTemplateName("");
  };

  const loadTemplate = () => {
    const template = templates.find((t) => t.id === selectedTemplateId);
    if (!template) return;

    const tpl = template.config.template || "instagram_post";
    const fallbackTier = (billingProfile?.access_tier_override || billingProfile?.subscription_tier || "starter") as BusinessAccessTier;

    setForm((prev) => ({
      ...prev,
      template: tpl,
      campaignType: template.config.campaignType || templateCampaignType[tpl],
      objective: template.config.objective || "",
      shortDescription: template.config.shortDescription || "",
      claimMethod: template.config.claimMethod || defaultClaimMethod(tpl, fallbackTier),
      contentFormat: template.config.contentFormat || TEMPLATE_FORMAT_OPTIONS[tpl][0],
      numberOfPosts: template.config.numberOfPosts || 1,
      postingDeadlineDays: template.config.postingDeadlineDays || TEMPLATE_DEFAULT_COMPLETION_DAYS[tpl],
      locationType: template.config.locationType || defaultLocationType(tpl),
      proofRequirements: template.config.proofRequirements?.length ? template.config.proofRequirements : [...TEMPLATE_PROOF_REQUIREMENTS[tpl]],
      eligibleAthleteTiers: template.config.eligibleAthleteTiers?.length ? template.config.eligibleAthleteTiers : ["Bronze", "Silver", "Gold", "Platinum", "Diamond"],
      termsAccepted: template.config.termsAccepted ?? false,
      prohibitedAcknowledged: template.config.prohibitedAcknowledged ?? false,
      additionalCompensation: template.config.additionalCompensation || "",
      tier: template.config.tier || "Silver",
      slots: template.config.slots || 2,
      payoutCents: template.config.payoutCents || 6500,
      locationText: template.config.locationText || "",
      directions: template.config.directions || "",
      claimWindowDays: (template.config.claimWindowDays || 5) as 3 | 5 | 7,
      completionWindowDays: template.config.completionWindowDays || TEMPLATE_DEFAULT_COMPLETION_DAYS[tpl],
    }));
    setCampaignError("");
  };

  const deleteTemplate = () => {
    if (!selectedTemplateId) return;
    const next = templates.filter((t) => t.id !== selectedTemplateId);
    persistTemplates(next);
    setSelectedTemplateId("");
  };

  const updateApplicationStatus = async (application: Application, nextStatus: Application["status"]) => {
    setStatusUpdatingId(application.id);
    setError("");

    const res = await fetch("/api/business/update-application-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId: application.id, status: nextStatus }),
    });

    const data = await res.json() as { error?: string; needsPayout?: boolean };

    if (!res.ok) {
      setStatusUpdatingId(null);
      setError(data.error || "Failed to update application status.");
      return;
    }

    if (data.needsPayout) {
      const payoutRes = await fetch("/api/stripe/trigger-payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: application.id }),
      });

      if (!payoutRes.ok) {
        const payoutData = await payoutRes.json() as { error?: string };
        setStatusUpdatingId(null);
        setError(payoutData.error || "Application approved but payout transfer failed.");
        await loadData();
        return;
      }
    }

    setStatusUpdatingId(null);
    await loadData();
  };

  const syncDiagnostics = async (applicationId: string) => {
    setError("");
    setSyncingDiagnosticsId(applicationId);

    const res = await fetch("/api/instagram/sync-diagnostics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId }),
    });

    const data = await res.json();
    setSyncingDiagnosticsId(null);

    if (!res.ok) {
      setError(data.error || "Failed to sync Instagram diagnostics.");
      return;
    }

    await loadData();
  };

  const syncCampaignDiagnostics = async (campaignId: string) => {
    setError("");
    setSyncingCampaignDiagnosticsId(campaignId);

    const targetApplications = applications.filter((a) => a.campaign_id === campaignId && !!a.proof_url);
    if (!targetApplications.length) {
      setSyncingCampaignDiagnosticsId(null);
      setError("No proof URLs found in this campaign yet.");
      return;
    }

    const failedIds: string[] = [];
    for (const app of targetApplications) {
      const res = await fetch("/api/instagram/sync-diagnostics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: app.id }),
      });

      if (!res.ok) {
        failedIds.push(app.id);
      }
    }

    setSyncingCampaignDiagnosticsId(null);
    if (failedIds.length > 0) {
      setError(`Some diagnostics could not sync (${failedIds.length}/${targetApplications.length}).`);
    }

    await loadData();
  };

  const loadAllAthletes = async () => {
    setLoadingAthletes(true);
    const { data: profileRows, error: profileError } = await supabase
      .from("athlete_profiles")
      .select("id, first_name, last_name, school, sport, city, state, latitude, longitude, instagram, deal_types, bio, minimum_payout, preferred_company_type, average_rating, total_ratings, profile_photo_url")
      .order("created_at", { ascending: false })
      .limit(100);

    if (profileError || !profileRows) {
      setLoadingAthletes(false);
      setAllAthletesLoaded(true);
      return;
    }

    const profiles = profileRows as AthleteProfile[];
    const athleteIds = profiles.map((p) => p.id);
    const xpMap: Record<string, number> = {};

    if (athleteIds.length) {
      const { data: xpRows } = await supabase
        .from("athlete_xp_events")
        .select("athlete_id, xp_delta")
        .in("athlete_id", athleteIds);

      for (const id of athleteIds) xpMap[id] = 0;
      for (const row of (xpRows || []) as { athlete_id: string; xp_delta: number }[]) {
        xpMap[row.athlete_id] = (xpMap[row.athlete_id] || 0) + row.xp_delta;
      }
    }

    setAllAthletes(profiles);
    setAllAthletesXp(xpMap);
    setLoadingAthletes(false);
    setAllAthletesLoaded(true);
  };

  const removeAthleteFromCampaign = async (application: Application) => {
    const ok = window.confirm("Remove this athlete from the campaign?");
    if (!ok) return;

    setError("");
    setRemovingAthleteId(application.id);

    const res = await fetch("/api/business/remove-athlete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId: application.id }),
    });

    const data = await res.json();
    setRemovingAthleteId(null);

    if (!res.ok) {
      setError(data.error || "Failed to remove athlete.");
      return;
    }

    await loadData();
  };

  const cancelCampaign = async (campaignId: string) => {
    const confirmed = window.confirm("Cancel this campaign? This is blocked once an athlete has a completed approved post.");
    if (!confirmed) return;

    setError("");
    setCancellingCampaignId(campaignId);

    const res = await fetch("/api/business/cancel-campaign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId }),
    });

    const data = await res.json();
    setCancellingCampaignId(null);

    if (!res.ok) {
      setError(data.error || "Failed to cancel campaign.");
      return;
    }

    await loadData();
  };

  const submitRating = async () => {
    if (!ratingModal) return;

    setError("");
    setSubmittingRating(true);

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setSubmittingRating(false);
      router.push("/login");
      return;
    }

    const application = applications.find((a) => a.id === ratingModal.applicationId);
    if (!application) {
      setSubmittingRating(false);
      setError("Application not found.");
      return;
    }

    const { error: insertError } = await supabase.from("athlete_ratings").insert({
      athlete_id: application.athlete_id,
      business_id: auth.user.id,
      application_id: ratingModal.applicationId,
      rating: ratingStars,
      review: ratingReview.trim() || null,
    });

    setSubmittingRating(false);

    if (insertError) {
      if (insertError.message.toLowerCase().includes("duplicate")) {
        setError("You already rated this athlete for this campaign.");
      } else {
        setError(insertError.message);
      }
      return;
    }

    setRatingModal(null);
    setRatingStars(5);
    setRatingReview("");
    await loadData();
  };

  const applicationsWithData = useMemo(() => {
    const maxTier = billingProfile?.max_athlete_tier || "Bronze";
    return applications
      .map((app) => ({
        app,
        campaign: campaigns.find((c) => c.id === app.campaign_id),
        athlete: athletesById[app.athlete_id],
      }))
      .filter((row) => {
        const athleteTier = athleteTierById[row.app.athlete_id] || "Bronze";
        return canAccessTier(maxTier, athleteTier);
      });
  }, [applications, campaigns, athletesById, athleteTierById, billingProfile]);

  const applicationsByCampaignId = useMemo(() => {
    const map: Record<string, Array<{ app: Application; campaign?: Campaign; athlete?: AthleteProfile }>> = {};
    for (const row of applicationsWithData) {
      if (!map[row.app.campaign_id]) map[row.app.campaign_id] = [];
      map[row.app.campaign_id].push(row);
    }
    return map;
  }, [applicationsWithData]);

  const athleteHistory = useMemo(() => {
    const map: Record<string, { athlete: AthleteProfile | undefined; applied: number; accepted: number; approved: number; lastStatus: string }> = {};

    for (const row of applicationsWithData) {
      const id = row.app.athlete_id;
      if (!map[id]) {
        map[id] = {
          athlete: row.athlete,
          applied: 0,
          accepted: 0,
          approved: 0,
          lastStatus: row.app.status,
        };
      }

      map[id].applied += 1;
      if (row.app.status === "accepted" || row.app.status === "submitted" || row.app.status === "approved") {
        map[id].accepted += 1;
      }
      if (row.app.status === "approved") {
        map[id].approved += 1;
      }
      map[id].lastStatus = row.app.status;
    }

    return Object.entries(map)
      .map(([athleteId, val]) => {
        const score = val.approved * 3 + val.accepted * 2 + val.applied;
        return {
          athleteId,
          name: fullName(val.athlete),
          tier: athleteTierById[athleteId] || "Bronze",
          sport: val.athlete?.sport || "-",
          applied: val.applied,
          accepted: val.accepted,
          approved: val.approved,
          lastStatus: val.lastStatus,
          score,
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [applicationsWithData, athleteTierById]);

  const diagnosticsSummary = useMemo(() => {
    const values = Object.values(diagnosticsByApplicationId);
    const summary = {
      total: values.length,
      verified: 0,
      mock: 0,
      unverified: 0,
      error: 0,
      avgReach: 0,
    };

    let reachTotal = 0;
    for (const d of values) {
      reachTotal += d.reach || 0;
      if (d.diagnostics_status === "verified") summary.verified += 1;
      else if (d.diagnostics_status === "mock" || d.diagnostics_status === "missing_connection") summary.mock += 1;
      else if (d.diagnostics_status === "unverified") summary.unverified += 1;
      else summary.error += 1;
    }

    summary.avgReach = values.length ? Math.round(reachTotal / values.length) : 0;
    return summary;
  }, [diagnosticsByApplicationId]);

  const campaignDiagnosticsStats = useMemo(() => {
    return campaigns.map((campaign) => {
      const campaignApps = applications.filter((a) => a.campaign_id === campaign.id);
      const diagnostics = campaignApps
        .map((a) => diagnosticsByApplicationId[a.id])
        .filter((d): d is InstagramDiagnostics => Boolean(d));

      const syncedCount = diagnostics.length;
      const verifiedCount = diagnostics.filter((d) => d.diagnostics_status === "verified").length;
      const avgReach = syncedCount ? Math.round(diagnostics.reduce((sum, d) => sum + (d.reach || 0), 0) / syncedCount) : 0;
      const totalEngagement = diagnostics.reduce((sum, d) => sum + (d.likes || 0) + (d.comments || 0) + (d.saves || 0), 0);

      return {
        campaignId: campaign.id,
        campaignTitle: campaign.title,
        syncedCount,
        verifiedCount,
        avgReach,
        totalEngagement,
      };
    });
  }, [campaigns, applications, diagnosticsByApplicationId]);

  useEffect(() => {
    const city = afCenterCity.trim();
    const state = afCenterState.trim();
    if (!city || !state) {
      setAfCenterCoords(null);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      (async () => {
        const response = await fetch("/api/location/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ city, state }),
        });
        if (!response.ok || cancelled) return;
        const data = (await response.json()) as { lat?: number | null; lon?: number | null };
        if (cancelled) return;
        if (typeof data.lat === "number" && typeof data.lon === "number") {
          setAfCenterCoords({ lat: data.lat, lon: data.lon });
          return;
        }
        setAfCenterCoords(null);
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [afCenterCity, afCenterState]);

  const filteredAthletes = useMemo(() => {
    if (!allAthletesLoaded) return [];

    const radius = parseFloat(afRadiusMiles);
    const useRadius = !isNaN(radius) && radius > 0;
    const centerCoords = afCenterCoords;

    const maxRaw = parseFloat(afMaxPayout);
    const maxPayout = isNaN(maxRaw) ? null : maxRaw;

    return allAthletes.filter((a) => {
      if (afSearch) {
        const q = afSearch.toLowerCase();
        if (
          !fullName(a).toLowerCase().includes(q) &&
          !(a.school || "").toLowerCase().includes(q) &&
          !(a.sport || "").toLowerCase().includes(q)
        ) return false;
      }
      if (afTier) {
        const tier = getTierFromXp(allAthletesXp[a.id] || 0);
        if (tier !== afTier) return false;
      }
      if (afDealType) {
        const deals = (a.deal_types || "").toLowerCase();
        if (!deals.includes(afDealType.toLowerCase())) return false;
      }
      if (afState) {
        const s = (a.state || "").trim().toLowerCase();
        if (!s.includes(afState.trim().toLowerCase())) return false;
      }
      if (maxPayout !== null) {
        const minP = parseFloat(a.minimum_payout || "0");
        if (!isNaN(minP) && minP > maxPayout) return false;
      }
      if (useRadius) {
        const athleteKey = locationKey(a.city, a.state);
        if (!centerCoords || !athleteKey) return false;
        const athleteCoords = locationCoords[athleteKey];
        if (!athleteCoords) return false;
        if (milesBetween(centerCoords, athleteCoords) > radius) return false;
      }
      return true;
    });
  }, [
    allAthletes,
    allAthletesXp,
    allAthletesLoaded,
    afSearch,
    afTier,
    afDealType,
    afState,
    afMaxPayout,
    afRadiusMiles,
    afCenterCity,
    afCenterState,
    afCenterCoords,
    locationCoords,
  ]);

  const athleteDistanceById = useMemo(() => {
    const centerCoords = afCenterCoords;
    if (!centerCoords) return {} as Record<string, number>;

    const next: Record<string, number> = {};
    for (const athlete of filteredAthletes) {
      const athleteKey = locationKey(athlete.city, athlete.state);
      const athleteCoords = athleteKey ? locationCoords[athleteKey] : null;
      if (athleteCoords) next[athlete.id] = milesBetween(centerCoords, athleteCoords);
    }
    return next;
  }, [filteredAthletes, afCenterCoords, locationCoords]);

  const sortedAthletes = useMemo(() => {
    const next = [...filteredAthletes];
    if (afSort === "rating_desc") {
      next.sort((a, b) => (b.average_rating || 0) - (a.average_rating || 0));
      return next;
    }
    if (afSort === "payout_asc") {
      next.sort((a, b) => (parseFloat(a.minimum_payout || "0") || 0) - (parseFloat(b.minimum_payout || "0") || 0));
      return next;
    }
    if (afSort === "tier_desc") {
      next.sort((a, b) => tierOrder[getTierFromXp(allAthletesXp[b.id] || 0)] - tierOrder[getTierFromXp(allAthletesXp[a.id] || 0)]);
      return next;
    }
    if (afSort === "nearest") {
      next.sort((a, b) => (athleteDistanceById[a.id] ?? Number.POSITIVE_INFINITY) - (athleteDistanceById[b.id] ?? Number.POSITIVE_INFINITY));
    }
    return next;
  }, [filteredAthletes, afSort, athleteDistanceById, allAthletesXp]);

  const allowedCampaignTiers = useMemo(() => {
    const maxTier = billingProfile?.max_athlete_tier || "Bronze";
    const tiers: AthleteTier[] = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"];
    return tiers.filter((t) => canAccessTier(maxTier, t));
  }, [billingProfile]);

  const effectiveAccessTier = useMemo(() => {
    return (billingProfile?.access_tier_override || billingProfile?.subscription_tier || "starter") as BusinessAccessTier;
  }, [billingProfile]);

  const allowedTemplates = useMemo(() => tierCampaignTemplates[effectiveAccessTier], [effectiveAccessTier]);

  useEffect(() => {
    if (!allowedCampaignTiers.includes(form.tier as AthleteTier)) {
      setForm((prev) => ({ ...prev, tier: allowedCampaignTiers[0] || "Bronze" }));
    }
  }, [allowedCampaignTiers, form.tier]);

  useEffect(() => {
    if (!allowedTemplates.includes(form.template)) {
      const nextTemplate = allowedTemplates[0] || "instagram_post";
      setForm((prev) => ({
        ...prev,
        template: nextTemplate,
        campaignType: templateCampaignType[nextTemplate],
        claimMethod: defaultClaimMethod(nextTemplate, effectiveAccessTier),
        contentFormat: TEMPLATE_FORMAT_OPTIONS[nextTemplate][0],
        proofRequirements: [...TEMPLATE_PROOF_REQUIREMENTS[nextTemplate]],
        locationType: defaultLocationType(nextTemplate),
        completionWindowDays: TEMPLATE_DEFAULT_COMPLETION_DAYS[nextTemplate],
      }));
    }
  }, [allowedTemplates, form.template, effectiveAccessTier]);

  useEffect(() => {
    const nextType = templateCampaignType[form.template];
    const nextFormats = TEMPLATE_FORMAT_OPTIONS[form.template];
    const nextClaimMethods = TEMPLATE_CLAIM_METHOD_OPTIONS[form.template];
    const nextClaimMethod = nextClaimMethods.includes(form.claimMethod)
      ? form.claimMethod
      : defaultClaimMethod(form.template, effectiveAccessTier);
    const nextFormat = nextFormats.includes(form.contentFormat) ? form.contentFormat : nextFormats[0];
    const nextCompletion = TEMPLATE_COMPLETION_DAY_OPTIONS[form.template].includes(form.completionWindowDays)
      ? form.completionWindowDays
      : TEMPLATE_DEFAULT_COMPLETION_DAYS[form.template];

    setForm((prev) => {
      const proofRequirements = prev.proofRequirements.length
        ? prev.proofRequirements
        : [...TEMPLATE_PROOF_REQUIREMENTS[form.template]];
      const locationType = defaultLocationType(form.template);
      if (
        prev.campaignType === nextType &&
        prev.claimMethod === nextClaimMethod &&
        prev.contentFormat === nextFormat &&
        prev.completionWindowDays === nextCompletion &&
        prev.locationType === locationType &&
        prev.proofRequirements.length === proofRequirements.length
      ) {
        return prev;
      }
      return {
        ...prev,
        campaignType: nextType,
        claimMethod: nextClaimMethod,
        contentFormat: nextFormat,
        completionWindowDays: nextCompletion,
        proofRequirements,
        locationType,
      };
    });
  }, [form.template]);

  const selectedAthlete = profileModalAthleteId ? athletesById[profileModalAthleteId] : undefined;

  if (loading) {
    return (
      <div className="auth-shell">
        <div className="auth-card">Loading business dashboard...</div>
      </div>
    );
  }

  return (
    <div className="portal-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <img src="/Hillink-logo-black-red.png" alt="HILLink" className="sidebar-logo" />
          </div>

          <nav className="sidebar-nav">
            <button className="sidebar-link active" onClick={() => scrollTo("top")}>
              <span className="sidebar-icon">⌂</span>
              <span>Home</span>
            </button>
            <button className="sidebar-link" onClick={() => scrollTo("campaigns")}>
              <span className="sidebar-icon">◧</span>
              <span>Current Campaigns</span>
            </button>
            <button className="sidebar-link" onClick={() => scrollTo("campaign-history")}>
              <span className="sidebar-icon">▦</span>
              <span>Campaign History</span>
            </button>
            <button className="sidebar-link" onClick={() => { scrollTo("find-athletes"); if (!allAthletesLoaded) loadAllAthletes(); }}>
              <span className="sidebar-icon">⊕</span>
              <span>Find Athletes</span>
            </button>
            <button className="sidebar-link" onClick={() => router.push("/settings")}>
              <span className="sidebar-icon">⚙</span>
              <span>Settings</span>
            </button>
          </nav>
        </div>

        <button
          className="sidebar-cta"
          onClick={() => {
            if (!billingProfile?.billing_ready || billingProfile?.subscription_status !== "active") {
              const message = "Finish billing setup in Settings before posting your first campaign.";
              setError(message);
              setCampaignError(message);
              router.push("/settings");
              return;
            }
            setError("");
            setCampaignError("");
            setShowModal(true);
          }}
        >
          Post New Campaign
        </button>
        {(!billingProfile?.billing_ready || billingProfile?.subscription_status !== "active") && (
          <div style={{ marginTop: 8, fontSize: 12, color: "#9ca3af", lineHeight: 1.4 }}>
            Complete billing in Settings to unlock campaign posting.
          </div>
        )}
      </aside>

      <main className="portal-main" id="top">
        <div className="topbar">
          <h1 className="page-title">Business Portal</h1>
          <div className="topbar-actions">
            <button
              className="cta-button"
              onClick={() => {
                if (!billingProfile?.billing_ready || billingProfile?.subscription_status !== "active") {
                  const message = "Finish billing setup in Settings before posting your first campaign.";
                  setError(message);
                  setCampaignError(message);
                  router.push("/settings");
                  return;
                }
                setError("");
                setCampaignError("");
                setShowModal(true);
              }}
            >
              Post New Campaign
            </button>
            <NotificationBell />
            <button className="secondary-button" onClick={handleLogout} disabled={signOutLoading}>
              {signOutLoading ? "Signing out..." : "Log out"}
            </button>
          </div>
        </div>

        {authError && <div className="error-message">Logout error: {authError}</div>}
        {error && <div className="error-message">{error}</div>}

        <section className="stats-grid four">
          <div className="stat-card">
            <div className="stat-title">Plan Tier</div>
            <div className="stat-value">{tierDisplayName[billingProfile?.subscription_tier || "starter"]}</div>
            <div className="stat-subtext">
              {billingProfile?.subscription_status || "inactive"}
              {billingProfile?.monthly_price_cents ? ` • $${Math.floor(billingProfile.monthly_price_cents / 100)}/mo` : ""}
            </div>
            {billingProfile?.access_tier_override && billingProfile.access_tier_override !== billingProfile.subscription_tier && (
              <div className="stat-subtext">Access override: {tierDisplayName[billingProfile.access_tier_override]}</div>
            )}
          </div>
          <div className="stat-card">
            <div className="stat-title">Open Campaigns</div>
            <div className="stat-value">{campaigns.filter((c) => c.status === "active" || c.status === "open").length}/{billingProfile?.max_open_campaigns || 1}</div>
            <div className="stat-subtext">plan allowance</div>
          </div>
          <div className="stat-card">
            <div className="stat-title">Max Slots / Campaign</div>
            <div className="stat-value">{billingProfile?.max_slots_per_campaign || 1}</div>
            <div className="stat-subtext">athlete amount access</div>
          </div>
          <div className="stat-card">
            <div className="stat-title">Max Athlete Tier</div>
            <div className="stat-value">{billingProfile?.max_athlete_tier || "Bronze"}</div>
            <div className="stat-subtext">type access limit</div>
          </div>
        </section>

        <section className="stats-grid four" style={{ marginTop: 18 }}>
          <div className="stat-card">
            <div className="stat-title">Diagnostics Synced</div>
            <div className="stat-value">{diagnosticsSummary.total}</div>
            <div className="stat-subtext">application diagnostics records</div>
          </div>
          <div className="stat-card">
            <div className="stat-title">Verified Posts</div>
            <div className="stat-value">{diagnosticsSummary.verified}</div>
            <div className="stat-subtext">graph API verified</div>
          </div>
          <div className="stat-card">
            <div className="stat-title">Needs Connection</div>
            <div className="stat-value">{diagnosticsSummary.mock + diagnosticsSummary.unverified}</div>
            <div className="stat-subtext">mock/unverified diagnostics</div>
          </div>
          <div className="stat-card">
            <div className="stat-title">Average Reach</div>
            <div className="stat-value">{diagnosticsSummary.avgReach}</div>
            <div className="stat-subtext">across synced proofs</div>
          </div>
        </section>

        <section id="campaigns" className="panel">
          <div className="panel-header">
            <h2>Current Campaigns</h2>
          </div>

          {campaigns.length === 0 ? (
            <p className="panel-note">No campaigns yet. Create your first campaign to start receiving athlete applications.</p>
          ) : (
            <div style={{ display: "grid", gap: 16, marginTop: 12 }}>
              {campaigns.filter((c) => c.status !== "completed" && c.status !== "cancelled").map((campaign) => {
                const diagStats = campaignDiagnosticsStats.find((d) => d.campaignId === campaign.id);
                const rows = (applicationsByCampaignId[campaign.id] || []).sort(
                  (a, b) => new Date(b.app.applied_at).getTime() - new Date(a.app.applied_at).getTime()
                );
                const activeAthletes = rows.filter((r) =>
                  r.app.status === "accepted" || r.app.status === "submitted" || r.app.status === "approved"
                );
                const applicants = rows.filter((r) => r.app.status === "applied");
                const completedCount = rows.filter((r) => r.app.status === "approved").length;
                const participantCount = rows.filter((r) =>
                  r.app.status === "accepted" || r.app.status === "submitted" || r.app.status === "approved"
                ).length;

                return (
                  <div
                    key={campaign.id}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 12,
                      overflow: "hidden",
                    }}
                  >
                    {/* Campaign header row */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto auto auto auto auto",
                        gap: 12,
                        alignItems: "center",
                        padding: "12px 16px",
                        background: "#fafafa",
                        borderBottom: rows.length > 0 ? "1px solid #e5e7eb" : undefined,
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{campaign.title}</div>
                        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                          {campaignTemplateLabel(campaign)} • {campaign.preferred_tier} • {(campaign.claim_method && claimMethodLabel[campaign.claim_method]) || "Business selects"} • ${(campaign.payout_cents / 100).toFixed(0)} payout
                        </div>
                      </div>
                      <span style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>
                        {campaign.open_slots ?? campaign.slots}/{campaign.slots} slots
                      </span>
                      <span style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>
                        Due {campaign.due_date || "—"}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "3px 10px",
                          borderRadius: 999,
                          background:
                            campaign.status === "active" || campaign.status === "open"
                              ? "#e7f8ee"
                              : campaign.status === "paused" || campaign.status === "closed"
                              ? "#fff6e5"
                              : campaign.status === "draft"
                              ? "#f3f4f6"
                              : "#f3f4f6",
                          color:
                            campaign.status === "active" || campaign.status === "open"
                              ? "#0a7f2e"
                              : campaign.status === "paused" || campaign.status === "closed"
                              ? "#8a5a00"
                              : "#6b7280",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {campaign.status}
                      </span>
                      <span style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>
                        {completedCount}/{participantCount} completed • {applicants.length} pending
                      </span>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
                        {diagStats && (
                          <button
                            className="small-button"
                            style={{ whiteSpace: "nowrap" }}
                            disabled={syncingCampaignDiagnosticsId === campaign.id}
                            onClick={() => syncCampaignDiagnostics(campaign.id)}
                            title="Sync Instagram diagnostics for all submitted proofs in this campaign"
                          >
                            {syncingCampaignDiagnosticsId === campaign.id ? "Syncing…" : "Sync Metrics"}
                          </button>
                        )}
                        <button
                          className="small-button"
                          style={{ whiteSpace: "nowrap" }}
                          onClick={() => router.push(`/business/campaigns/${campaign.id}/deliverables`)}
                        >
                          Review Submissions
                        </button>
                        {completedCount === 0 && (
                          <button
                            className="small-button"
                            style={{ whiteSpace: "nowrap", background: "#fff1f2", color: "#b91c1c", borderColor: "#fecdd3" }}
                            disabled={cancellingCampaignId === campaign.id}
                            onClick={() => cancelCampaign(campaign.id)}
                          >
                            {cancellingCampaignId === campaign.id ? "Cancelling…" : "Cancel Campaign"}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Athlete rows */}
                    {rows.length > 0 && (
                      <div style={{ padding: "8px 16px 12px" }}>
                        {rows.map(({ app, athlete }) => {
                          const isExpanded = expandedCampaignAthleteId === app.id;
                          const diag = diagnosticsByApplicationId[app.id];

                          const taskDone = app.status === "approved";
                          const taskSubmitted = app.status === "submitted";
                          const taskActive = app.status === "accepted";
                          const taskPending = app.status === "applied";

                          const completionBadge = taskDone
                            ? { label: "✓ Completed", bg: "#e7f8ee", color: "#0a7f2e" }
                            : taskSubmitted
                            ? { label: "Proof submitted", bg: "#fff6e5", color: "#8a5a00" }
                            : taskActive
                            ? { label: "In progress", bg: "#eff6ff", color: "#1d4ed8" }
                            : taskPending
                            ? { label: "Applied", bg: "#f3f4f6", color: "#6b7280" }
                            : { label: statusLabel(app.status), bg: "#fee2e2", color: "#991b1b" };

                          return (
                            <div
                              key={app.id}
                              style={{
                                borderTop: "1px solid #f3f4f6",
                                paddingTop: 10,
                                marginTop: 10,
                              }}
                            >
                              {/* Athlete summary row */}
                              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                <button
                                  className="ghost-button"
                                  style={{ padding: 0, fontWeight: 600, fontSize: 14 }}
                                  onClick={() =>
                                    setExpandedCampaignAthleteId(isExpanded ? null : app.id)
                                  }
                                >
                                  {isExpanded ? "▾" : "▸"} {fullName(athlete)}
                                </button>
                                <span style={{ fontSize: 12, color: "#9ca3af" }}>
                                  {athleteTierById[app.athlete_id] || "Bronze"} • {athlete?.school || "—"} • {athlete?.sport || "—"}
                                </span>
                                <span
                                  style={{
                                    marginLeft: "auto",
                                    fontSize: 11,
                                    fontWeight: 700,
                                    padding: "2px 9px",
                                    borderRadius: 999,
                                    background: completionBadge.bg,
                                    color: completionBadge.color,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {completionBadge.label}
                                </span>
                              </div>

                              {/* Expanded athlete details */}
                              {isExpanded && (
                                <div style={{ marginTop: 10, paddingLeft: 16, borderLeft: "2px solid #e5e7eb" }}>
                                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: "#374151", marginBottom: 8 }}>
                                    <span><strong>City:</strong> {athlete?.city || "—"}, {athlete?.state || "—"}</span>
                                    <span><strong>Rating:</strong> {athlete?.average_rating ? `${athlete.average_rating.toFixed(1)} (${athlete.total_ratings ?? 0})` : "No ratings"}</span>
                                    {athlete?.bio && <span style={{ flexBasis: "100%" }}><strong>Bio:</strong> {athlete.bio}</span>}
                                  </div>

                                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: diag ? 8 : 0 }}>
                                    <button
                                      className="small-button"
                                      onClick={() => setProfileModalAthleteId(app.athlete_id)}
                                    >
                                      Full Profile
                                    </button>
                                    {app.status === "applied" && (
                                      <>
                                        <button className="small-button" disabled={statusUpdatingId === app.id} onClick={() => updateApplicationStatus(app, "accepted")}>Accept</button>
                                        <button className="small-button" disabled={statusUpdatingId === app.id} onClick={() => updateApplicationStatus(app, "declined")}>Decline</button>
                                      </>
                                    )}
                                    {app.status === "submitted" && (
                                      <>
                                        <button className="small-button" disabled={statusUpdatingId === app.id} onClick={() => updateApplicationStatus(app, "approved")}>Approve</button>
                                        <button className="small-button" disabled={statusUpdatingId === app.id} onClick={() => updateApplicationStatus(app, "rejected")}>Reject</button>
                                      </>
                                    )}
                                    {(app.status === "applied" || app.status === "accepted" || app.status === "submitted") && (
                                      <button className="small-button" disabled={removingAthleteId === app.id} onClick={() => removeAthleteFromCampaign(app)}>
                                        {removingAthleteId === app.id ? "Removing…" : app.status === "applied" ? "Remove Applicant" : "Remove Athlete"}
                                      </button>
                                    )}
                                    {app.proof_url && (
                                      <>
                                        <a href={app.proof_url} target="_blank" rel="noreferrer" className="small-button" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>View Proof</a>
                                        <button className="small-button" disabled={syncingDiagnosticsId === app.id} onClick={() => syncDiagnostics(app.id)}>
                                          {syncingDiagnosticsId === app.id ? "Syncing…" : "Sync Diagnostics"}
                                        </button>
                                      </>
                                    )}
                                  </div>

                                  {diag && (
                                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                                      <span
                                        style={{
                                          display: "inline-flex",
                                          padding: "2px 8px",
                                          borderRadius: 999,
                                          fontWeight: 700,
                                          background: diagnosticsTone(diag.diagnostics_status).bg,
                                          color: diagnosticsTone(diag.diagnostics_status).color,
                                          marginBottom: 4,
                                        }}
                                      >
                                        {diag.diagnostics_status}
                                      </span>
                                      <div>L {diag.likes} • C {diag.comments} • S {diag.saves} • R {diag.reach} • V {diag.video_views}</div>
                                      {diag.diagnostics_notes && <div style={{ marginTop: 2 }}>{diag.diagnostics_notes}</div>}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section id="campaign-history" className="panel">
          <div className="panel-header">
            <h2>Campaign History</h2>
          </div>

          {campaigns.filter((c) => c.status === "completed" || c.status === "cancelled" || c.status === "closed").length === 0 ? (
            <p className="panel-note">No past campaigns yet.</p>
          ) : (
            <div style={{ display: "grid", gap: 16, marginTop: 12 }}>
              {campaigns.filter((c) => c.status === "completed" || c.status === "cancelled" || c.status === "closed").map((campaign) => {
                const diagStats = campaignDiagnosticsStats.find((d) => d.campaignId === campaign.id);
                const rows = (applicationsByCampaignId[campaign.id] || []).sort(
                  (a, b) => new Date(b.app.applied_at).getTime() - new Date(a.app.applied_at).getTime()
                );
                const completedHist = rows.filter((r) => r.app.status === "approved").length;
                const participantHist = rows.filter((r) =>
                  r.app.status === "accepted" || r.app.status === "submitted" || r.app.status === "approved"
                ).length;

                return (
                  <div
                    key={campaign.id}
                    style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto auto auto auto",
                        gap: 12,
                        alignItems: "center",
                        padding: "12px 16px",
                        background: "#fafafa",
                        borderBottom: rows.length > 0 ? "1px solid #e5e7eb" : undefined,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{campaign.title}</div>
                        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                          {campaignTemplateLabel(campaign)} • {campaign.preferred_tier} • {(campaign.claim_method && claimMethodLabel[campaign.claim_method]) || "Business selects"} • ${(campaign.payout_cents / 100).toFixed(0)} payout
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "3px 10px",
                          borderRadius: 999,
                          background: "#f3f4f6",
                          color: "#6b7280",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {campaign.status}
                      </span>
                      <span style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>
                        {completedHist}/{participantHist} completed
                      </span>
                      <span style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>
                        Due {campaign.due_date || "—"}
                      </span>
                      {diagStats && (
                        <button
                          className="small-button"
                          style={{ whiteSpace: "nowrap" }}
                          disabled={syncingCampaignDiagnosticsId === campaign.id}
                          onClick={() => syncCampaignDiagnostics(campaign.id)}
                          title="Sync Instagram diagnostics for all submitted proofs in this campaign"
                        >
                          {syncingCampaignDiagnosticsId === campaign.id ? "Syncing…" : "Sync Metrics"}
                        </button>
                      )}
                      <button
                        className="small-button"
                        style={{ whiteSpace: "nowrap" }}
                        onClick={() => router.push(`/business/campaigns/${campaign.id}/deliverables`)}
                      >
                        Review Submissions
                      </button>
                    </div>

                    {rows.length > 0 && (
                      <div style={{ padding: "8px 16px 12px" }}>
                        {rows.map(({ app, athlete }) => {
                          const isExpanded = expandedCampaignAthleteId === app.id;
                          const diag = diagnosticsByApplicationId[app.id];
                          const badge = app.status === "approved"
                            ? { label: "✓ Completed", bg: "#e7f8ee", color: "#0a7f2e" }
                            : app.status === "submitted"
                            ? { label: "Proof submitted", bg: "#fff6e5", color: "#8a5a00" }
                            : app.status === "declined" || app.status === "rejected" || app.status === "withdrawn"
                            ? { label: statusLabel(app.status), bg: "#fee2e2", color: "#991b1b" }
                            : { label: statusLabel(app.status), bg: "#f3f4f6", color: "#6b7280" };

                          return (
                            <div key={app.id} style={{ borderTop: "1px solid #f3f4f6", paddingTop: 10, marginTop: 10 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                <button
                                  className="ghost-button"
                                  style={{ padding: 0, fontWeight: 600, fontSize: 14 }}
                                  onClick={() => setExpandedCampaignAthleteId(isExpanded ? null : app.id)}
                                >
                                  {isExpanded ? "▾" : "▸"} {fullName(athlete)}
                                </button>
                                <span style={{ fontSize: 12, color: "#9ca3af" }}>
                                  {athleteTierById[app.athlete_id] || "Bronze"} • {athlete?.school || "—"} • {athlete?.sport || "—"}
                                </span>
                                <span
                                  style={{
                                    marginLeft: "auto",
                                    fontSize: 11,
                                    fontWeight: 700,
                                    padding: "2px 9px",
                                    borderRadius: 999,
                                    background: badge.bg,
                                    color: badge.color,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {badge.label}
                                </span>
                              </div>

                              {isExpanded && (
                                <div style={{ marginTop: 10, paddingLeft: 16, borderLeft: "2px solid #e5e7eb" }}>
                                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: "#374151", marginBottom: 8 }}>
                                    <span><strong>City:</strong> {athlete?.city || "—"}, {athlete?.state || "—"}</span>
                                    <span><strong>Rating:</strong> {athlete?.average_rating ? `${athlete.average_rating.toFixed(1)} (${athlete.total_ratings ?? 0})` : "No ratings"}</span>
                                    {athlete?.bio && <span style={{ flexBasis: "100%" }}><strong>Bio:</strong> {athlete.bio}</span>}
                                  </div>
                                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: diag ? 8 : 0 }}>
                                    <button className="small-button" onClick={() => setProfileModalAthleteId(app.athlete_id)}>Full Profile</button>
                                    {app.status === "approved" && (
                                      <button className="small-button" onClick={() => setRatingModal({ applicationId: app.id, athleteName: fullName(athlete) })}>Rate Athlete</button>
                                    )}
                                    {app.proof_url && (
                                      <a href={app.proof_url} target="_blank" rel="noreferrer" className="small-button" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>View Proof</a>
                                    )}
                                  </div>
                                  {diag && (
                                    <div style={{ fontSize: 12, color: "#6b7280" }}>
                                      <span
                                        style={{
                                          display: "inline-flex",
                                          padding: "2px 8px",
                                          borderRadius: 999,
                                          fontWeight: 700,
                                          background: diagnosticsTone(diag.diagnostics_status).bg,
                                          color: diagnosticsTone(diag.diagnostics_status).color,
                                          marginBottom: 4,
                                        }}
                                      >
                                        {diag.diagnostics_status}
                                      </span>
                                      <div>L {diag.likes} • C {diag.comments} • S {diag.saves} • R {diag.reach} • V {diag.video_views}</div>
                                      {diag.diagnostics_notes && <div style={{ marginTop: 2 }}>{diag.diagnostics_notes}</div>}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section id="find-athletes" className="panel" style={{ marginTop: 18 }}>
          <div className="panel-header">
            <h2>Find Athletes</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {allAthletesLoaded && (
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  {filteredAthletes.length} of {allAthletes.length} athletes
                </span>
              )}
              {!allAthletesLoaded && (
                <button className="small-button" onClick={loadAllAthletes} disabled={loadingAthletes}>
                  {loadingAthletes ? "Loading..." : "Browse Athletes"}
                </button>
              )}
            </div>
          </div>

          {!allAthletesLoaded && !loadingAthletes && (
            <p className="panel-note">Click &ldquo;Browse Athletes&rdquo; to discover athletes for your campaigns.</p>
          )}
          {loadingAthletes && (
            <p className="panel-note">Loading athlete directory...</p>
          )}

          {allAthletesLoaded && (
            <>
              <div className="filter-bar">
                <input
                  className="filter-input"
                  placeholder="Search name, school, sport..."
                  value={afSearch}
                  onChange={(e) => setAfSearch(e.target.value)}
                />
                <select className="filter-select" value={afTier} onChange={(e) => setAfTier(e.target.value)}>
                  <option value="">All tiers</option>
                  <option value="Bronze">Bronze</option>
                  <option value="Silver">Silver</option>
                  <option value="Gold">Gold</option>
                  <option value="Platinum">Platinum</option>
                  <option value="Diamond">Diamond</option>
                </select>
                <select className="filter-select" value={afDealType} onChange={(e) => setAfDealType(e.target.value)}>
                  <option value="">All deal types</option>
                  <option value="Instagram Post">Instagram Post</option>
                  <option value="TikTok Post">TikTok Post</option>
                  <option value="Story / Reel">Story / Reel</option>
                  <option value="Event Appearance">Event Appearance</option>
                  <option value="Product Promotion">Product Promotion</option>
                  <option value="Brand Ambassador">Brand Ambassador</option>
                  <option value="Local Business Promotion">Local Business Promotion</option>
                </select>
                <input
                  className="filter-input"
                  placeholder="State (e.g. TX)"
                  value={afState}
                  onChange={(e) => setAfState(e.target.value)}
                />
                <input
                  className="filter-input"
                  placeholder="Center city"
                  value={afCenterCity}
                  onChange={(e) => setAfCenterCity(e.target.value)}
                />
                <input
                  className="filter-input filter-input-sm"
                  placeholder="Center ST"
                  value={afCenterState}
                  onChange={(e) => setAfCenterState(e.target.value)}
                />
                <input
                  className="filter-input filter-input-sm"
                  placeholder="Radius mi"
                  type="number"
                  min="1"
                  value={afRadiusMiles}
                  onChange={(e) => setAfRadiusMiles(e.target.value)}
                />
                <input
                  className="filter-input filter-input-sm"
                  placeholder="Max payout $"
                  type="number"
                  min="0"
                  value={afMaxPayout}
                  onChange={(e) => setAfMaxPayout(e.target.value)}
                />
                <select className="filter-select" value={afSort} onChange={(e) => setAfSort(e.target.value)}>
                  <option value="nearest">Nearest first</option>
                  <option value="rating_desc">Highest rated</option>
                  <option value="payout_asc">Lowest payout</option>
                  <option value="tier_desc">Highest tier</option>
                </select>
                {(afSearch || afTier || afDealType || afState || afCenterCity || afCenterState || afRadiusMiles || afMaxPayout || afSort !== "nearest") && (
                  <button
                    className="ghost-button"
                    style={{ fontSize: 12, whiteSpace: "nowrap" }}
                    onClick={() => {
                      setAfSearch("");
                      setAfTier("");
                      setAfDealType("");
                      setAfState("");
                      setAfCenterCity("");
                      setAfCenterState("");
                      setAfRadiusMiles("");
                      setAfMaxPayout("");
                      setAfSort("nearest");
                    }}
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {afRadiusMiles && !(afCenterCity && afCenterState) && (
                <p className="panel-note" style={{ marginTop: 0 }}>
                  Add center city and state to use radius filtering.
                </p>
              )}

              {sortedAthletes.length === 0 ? (
                <p className="panel-note">No athletes match these filters.</p>
              ) : (
                <div className="athlete-dir-grid">
                  {sortedAthletes.slice(0, 60).map((athlete) => {
                    const xp = allAthletesXp[athlete.id] || 0;
                    const tier = getTierFromXp(xp);
                    const distanceLabel = formatMilesLabel(athleteDistanceById[athlete.id]);
                    return (
                      <div key={athlete.id} className="athlete-dir-card">
                        <div className="athlete-dir-card-header" style={{ alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                            <img
                              src={athlete.profile_photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName(athlete))}&background=ef233c&color=fff&size=96`}
                              alt={fullName(athlete)}
                              style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "1px solid #e5e7eb" }}
                            />
                            <span className="athlete-dir-name">{fullName(athlete)}</span>
                          </div>
                          <span className={`tier-badge tier-${tier.toLowerCase()}`}>{tier}</span>
                        </div>
                        <div className="athlete-dir-meta">
                          {athlete.sport && <span>{athlete.sport}</span>}
                          {athlete.school && <span>{athlete.school}</span>}
                          {(athlete.city || athlete.state) && (
                            <span>{[athlete.city, athlete.state].filter(Boolean).join(", ")}</span>
                          )}
                        </div>
                        {athlete.deal_types && (
                          <div className="athlete-dir-deals">{athlete.deal_types}</div>
                        )}
                        <div className="athlete-dir-footer">
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            {distanceLabel && (
                              <span className="athlete-dir-rating">{distanceLabel}</span>
                            )}
                            {athlete.minimum_payout && (
                              <span className="athlete-dir-payout">From ${athlete.minimum_payout}</span>
                            )}
                            {athlete.average_rating && (
                              <span className="athlete-dir-rating">{Number(athlete.average_rating).toFixed(1)} ★</span>
                            )}
                          </div>
                          <button
                            className="small-button"
                            onClick={() => {
                              setAthletesById((prev) => ({ ...prev, [athlete.id]: athlete }));
                              setAthleteXpById((prev) => ({ ...prev, [athlete.id]: xp }));
                              setAthleteTierById((prev) => ({ ...prev, [athlete.id]: tier }));
                              setProfileModalAthleteId(athlete.id);
                            }}
                          >
                            View Profile
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>

        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal wide" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
              <div className="modal-header">
                <h3>Post New Campaign</h3>
                <button className="ghost-button" onClick={() => setShowModal(false)}>✕</button>
              </div>

              <div className="modal-body" style={{ overflowY: "auto" }}>
                {campaignError && <div className="error-message" style={{ marginBottom: 12 }}>{campaignError}</div>}

                <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, marginBottom: 14, background: "#fafafa" }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Saved Templates</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, marginBottom: 8 }}>
                    <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}>
                      <option value="">Select a template</option>
                      {templates.map((template) => (
                        <option key={template.id} value={template.id}>{template.name}</option>
                      ))}
                    </select>
                    <button type="button" className="secondary-button" disabled={!selectedTemplateId} onClick={loadTemplate}>Load</button>
                    <button type="button" className="ghost-button" disabled={!selectedTemplateId} onClick={deleteTemplate}>Delete</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                    <input
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="Template name (e.g. Weekend Launch)"
                    />
                    <button type="button" className="secondary-button" onClick={saveTemplate}>Save Current</button>
                  </div>
                </div>

                <div className="form-grid two">
                  <label>
                    Campaign template
                    <select
                      value={form.template}
                      onChange={(e) => {
                        const nextTemplate = e.target.value as CampaignTemplateKey;
                        const nextFormats = TEMPLATE_FORMAT_OPTIONS[nextTemplate];
                        const nextClaim = defaultClaimMethod(nextTemplate, effectiveAccessTier);
                        setForm({
                          ...form,
                          template: nextTemplate,
                          campaignType: templateCampaignType[nextTemplate],
                          claimMethod: nextClaim,
                          contentFormat: nextFormats[0],
                          postingDeadlineDays: TEMPLATE_DEFAULT_COMPLETION_DAYS[nextTemplate],
                          completionWindowDays: TEMPLATE_DEFAULT_COMPLETION_DAYS[nextTemplate],
                          locationType: defaultLocationType(nextTemplate),
                          proofRequirements: [...TEMPLATE_PROOF_REQUIREMENTS[nextTemplate]],
                        });
                      }}
                    >
                      {allowedTemplates.map((tpl) => (
                        <option key={tpl} value={tpl}>{TEMPLATE_LABELS[tpl]}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Content format
                    <select
                      value={form.contentFormat}
                      onChange={(e) => setForm({ ...form, contentFormat: e.target.value as CampaignContentFormat })}
                    >
                      {TEMPLATE_FORMAT_OPTIONS[form.template].map((format) => (
                        <option key={format} value={format}>{CONTENT_FORMAT_LABELS[format]}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Campaign title
                    <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                  </label>

                  <label>
                    Short description
                    <input
                      value={form.shortDescription}
                      onChange={(e) => setForm({ ...form, shortDescription: e.target.value })}
                      placeholder="One-line campaign pitch"
                    />
                  </label>

                  <label style={{ gridColumn: "1 / -1" }}>
                    Campaign objective
                    <input
                      value={form.objective}
                      onChange={(e) => setForm({ ...form, objective: e.target.value })}
                      placeholder="What result are you trying to drive? (foot traffic, awareness, code usage...)"
                    />
                  </label>

                  <label>
                    Number of posts
                    <select value={form.numberOfPosts} onChange={(e) => setForm({ ...form, numberOfPosts: Number(e.target.value) || 1 })}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Posting deadline after claim
                    <select
                      value={form.postingDeadlineDays}
                      onChange={(e) => setForm({ ...form, postingDeadlineDays: Number(e.target.value) || 3 })}
                    >
                      {TEMPLATE_COMPLETION_DAY_OPTIONS[form.template].map((days) => (
                        <option key={days} value={days}>{days} day{days === 1 ? "" : "s"}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Claim method
                    <select
                      value={form.claimMethod}
                      onChange={(e) => setForm({ ...form, claimMethod: e.target.value as ClaimMethod })}
                    >
                      {TEMPLATE_CLAIM_METHOD_OPTIONS[form.template].map((method) => (
                        <option key={method} value={method}>{claimMethodLabel[method]}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Primary payout tier
                    <select value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value as Campaign["preferred_tier"] })}>
                      {allowedCampaignTiers.map((tierOption) => (
                        <option key={tierOption} value={tierOption}>{tierOption}</option>
                      ))}
                    </select>
                  </label>

                  <label style={{ gridColumn: "1 / -1" }}>
                    Eligible athlete tiers
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
                      {["Bronze", "Silver", "Gold", "Platinum", "Diamond"].map((tierOption) => {
                        const disabled = !allowedCampaignTiers.includes(tierOption as AthleteTier);
                        const checked = form.eligibleAthleteTiers.includes(tierOption as AthleteTier);
                        return (
                          <label key={tierOption} style={{ display: "inline-flex", alignItems: "center", gap: 6, opacity: disabled ? 0.45 : 1 }}>
                            <input
                              type="checkbox"
                              disabled={disabled}
                              checked={checked}
                              onChange={(e) => {
                                const tierValue = tierOption as AthleteTier;
                                const next = e.target.checked
                                  ? [...form.eligibleAthleteTiers, tierValue]
                                  : form.eligibleAthleteTiers.filter((x) => x !== tierValue);
                                setForm({ ...form, eligibleAthleteTiers: next });
                              }}
                            />
                            {tierOption}
                          </label>
                        );
                      })}
                    </div>
                  </label>

                  <label>
                    Slots ({form.slots})
                    <input
                      type="range"
                      min="1"
                      max={billingProfile?.max_slots_per_campaign || 1}
                      value={form.slots}
                      onChange={(e) => setForm({ ...form, slots: Number(e.target.value) || 1 })}
                    />
                  </label>

                  <label>
                    Payout per athlete (USD)
                    <input
                      type="number"
                      min="0"
                      value={Math.floor(form.payoutCents / 100)}
                      onChange={(e) => setForm({ ...form, payoutCents: (Number(e.target.value) || 0) * 100 })}
                    />
                  </label>

                  <label>
                    Location mode
                    <select value={form.locationType} onChange={(e) => setForm({ ...form, locationType: e.target.value as LocationType })}>
                      <option value="local_only">Local only</option>
                      <option value="shipped">Shipped</option>
                      <option value="hybrid">Hybrid</option>
                    </select>
                  </label>

                  <label>
                    Campaign location
                    <input
                      value={form.locationText}
                      onChange={(e) => setForm({ ...form, locationText: e.target.value })}
                      placeholder={form.locationType === "shipped" ? "Shipping region (e.g. US only)" : "Austin, TX"}
                    />
                  </label>

                  <label>
                    Additional compensation (optional)
                    <input
                      value={form.additionalCompensation}
                      onChange={(e) => setForm({ ...form, additionalCompensation: e.target.value })}
                      placeholder="food, free membership, gift card, store credit"
                    />
                  </label>

                  <label>
                    Completion window
                    <select
                      value={form.completionWindowDays}
                      onChange={(e) => setForm({ ...form, completionWindowDays: Number(e.target.value) || 3 })}
                    >
                      {TEMPLATE_COMPLETION_DAY_OPTIONS[form.template].map((days) => (
                        <option key={days} value={days}>{days} day{days === 1 ? "" : "s"}</option>
                      ))}
                    </select>
                  </label>

                  <label style={{ gridColumn: "1 / -1" }}>
                    Proof requirements
                    <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                      {TEMPLATE_PROOF_REQUIREMENTS[form.template].map((item) => {
                        const checked = form.proofRequirements.includes(item);
                        return (
                          <label key={item} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...form.proofRequirements, item]
                                  : form.proofRequirements.filter((value) => value !== item);
                                setForm({ ...form, proofRequirements: next });
                              }}
                            />
                            {item}
                          </label>
                        );
                      })}
                    </div>
                  </label>

                  <label style={{ gridColumn: "1 / -1" }}>
                    Directions for athletes
                    <textarea
                      value={form.directions}
                      onChange={(e) => setForm({ ...form, directions: e.target.value })}
                      placeholder="Exact instructions athletes must follow, including required talking points and CTA."
                      style={{ minHeight: 110 }}
                    />
                  </label>
                </div>

                <div className="campaign-timeline-section">
                    <div className="timeline-section-header">
                      <span className="timeline-icon">⏱</span>
                      <div>
                        <strong>Campaign Timeline</strong>
                        <p className="timeline-subtext">Set how long each stage lasts. These keep your marketplace active and protect both sides.</p>
                      </div>
                    </div>

                    <div className="timeline-row">
                      <div className="timeline-layer">
                        <div className="timeline-layer-label">
                          <span className="timeline-badge claim">1</span>
                          <div>
                            <strong>Claim Window</strong>
                            <span className="timeline-layer-desc">How long athletes have to apply</span>
                          </div>
                        </div>
                        <div className="timeline-options">
                          {([3, 5, 7] as const).map((days) => (
                            <button
                              key={days}
                              type="button"
                              className={`timeline-option-btn${form.claimWindowDays === days ? " selected" : ""}`}
                              onClick={() => setForm({ ...form, claimWindowDays: days })}
                            >
                              {days} days{days === 5 ? " ✓" : ""}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="timeline-layer">
                        <div className="timeline-layer-label">
                          <span className="timeline-badge complete">2</span>
                          <div>
                            <strong>Completion Window</strong>
                            <span className="timeline-layer-desc">How long athletes have to post after claiming</span>
                          </div>
                        </div>
                        <div className="timeline-options">
                          {TEMPLATE_COMPLETION_DAY_OPTIONS[form.template].map((days) => (
                            <button
                              key={days}
                              type="button"
                              className={`timeline-option-btn${form.completionWindowDays === days ? " selected" : ""}`}
                              onClick={() => setForm({ ...form, completionWindowDays: days })}
                            >
                              {days} day{days === 1 ? "" : "s"}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="timeline-layer timeline-layer-fixed">
                        <div className="timeline-layer-label">
                          <span className="timeline-badge review">3</span>
                          <div>
                            <strong>Review Window</strong>
                            <span className="timeline-layer-desc">Your time to approve or dispute a submitted post</span>
                          </div>
                        </div>
                        <div className="timeline-fixed-note">
                          <span>48 hours — fixed</span>
                          <span className="timeline-auto-note">After 48h with no action, post is auto-approved and payout is released</span>
                        </div>
                      </div>
                    </div>

                    <div className="timeline-summary">
                      Athletes have until <strong>{(() => {
                        const d = new Date();
                        d.setDate(d.getDate() + form.claimWindowDays);
                        d.setDate(d.getDate() + form.postingDeadlineDays);
                        return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                      })()}</strong> to complete. If the campaign isn&apos;t filled in {form.claimWindowDays} days, it auto-closes.
                    </div>
                  </div>

                <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, marginTop: 14 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Review before publishing</div>
                  <div style={{ display: "grid", gap: 6, fontSize: 14 }}>
                    <div><strong>Template:</strong> {TEMPLATE_LABELS[form.template]}</div>
                    <div><strong>Type:</strong> {campaignTypeLabel[form.campaignType]}</div>
                    <div><strong>Compensation:</strong> ${(form.payoutCents / 100).toFixed(0)} per athlete{form.additionalCompensation ? ` + ${form.additionalCompensation}` : ""}</div>
                    <div><strong>Slots:</strong> {form.slots}</div>
                    <div><strong>Claim method:</strong> {claimMethodLabel[form.claimMethod]}</div>
                    <div><strong>Eligible tiers:</strong> {form.eligibleAthleteTiers.join(", ")}</div>
                    <div><strong>Proof required:</strong> {form.proofRequirements.join(" • ")}</div>
                  </div>
                  <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={form.termsAccepted}
                        onChange={(e) => setForm({ ...form, termsAccepted: e.target.checked })}
                      />
                      I confirm these requirements are accurate and compensation is truthful.
                    </label>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={form.prohibitedAcknowledged}
                        onChange={(e) => setForm({ ...form, prohibitedAcknowledged: e.target.checked })}
                      />
                      I acknowledge prohibited categories and compliance rules.
                    </label>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button className="secondary-button" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="cta-button" disabled={creating} onClick={submitCampaign}>
                  {creating ? "Creating..." : "Create Campaign"}
                </button>
              </div>
            </div>
          </div>
        )}

        {ratingModal && (
          <div className="modal-overlay" onClick={() => setRatingModal(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Rate {ratingModal.athleteName}</h3>
                <button className="ghost-button" onClick={() => setRatingModal(null)}>✕</button>
              </div>

              <div className="modal-body">
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "block", marginBottom: 10 }}>
                    Rating (1-5 stars)
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => setRatingStars(star)}
                        style={{
                          fontSize: 28,
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          opacity: star <= ratingStars ? 1 : 0.3,
                        }}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 14, color: "#666" }}>
                    {ratingStars} star{ratingStars !== 1 ? "s" : ""}
                  </div>
                </div>

                <label style={{ display: "block" }}>
                  Review (optional)
                  <textarea
                    value={ratingReview}
                    onChange={(e) => setRatingReview(e.target.value)}
                    placeholder="Share feedback about this athlete's performance..."
                    style={{ width: "100%", minHeight: 100, marginTop: 8 }}
                  />
                </label>
              </div>

              <div className="modal-footer">
                <button className="secondary-button" onClick={() => setRatingModal(null)}>Cancel</button>
                <button className="cta-button" disabled={submittingRating} onClick={submitRating}>
                  {submittingRating ? "Submitting..." : "Submit Rating"}
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedAthlete && profileModalAthleteId && (
          <div className="modal-overlay" onClick={() => setProfileModalAthleteId(null)}>
            <div className="modal wide" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>{fullName(selectedAthlete)} • Athlete Profile</h3>
                <button className="ghost-button" onClick={() => setProfileModalAthleteId(null)}>✕</button>
              </div>
              <div className="modal-body">
                <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 14, alignItems: "center" }}>
                  <img
                    src={selectedAthlete.profile_photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName(selectedAthlete))}&background=ef233c&color=fff&size=160`}
                    alt={fullName(selectedAthlete)}
                    style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", border: "2px solid #e5e7eb" }}
                  />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>{fullName(selectedAthlete)}</div>
                    <div style={{ color: "#666", marginTop: 2 }}>
                      {(selectedAthlete.school || "No school listed")} • {(selectedAthlete.sport || "No sport listed")}
                    </div>
                  </div>
                </div>

                <div className="stats-grid four" style={{ marginTop: 14 }}>
                  <div className="stat-card">
                    <div className="stat-title">Rank</div>
                    <div className="stat-value">{athleteTierById[profileModalAthleteId] || "Bronze"}</div>
                    <div className="stat-subtext">{athleteXpById[profileModalAthleteId] || 0} XP</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-title">Rating</div>
                    <div className="stat-value">
                      {selectedAthlete.average_rating ? `${Number(selectedAthlete.average_rating).toFixed(2)} ★` : "No ratings"}
                    </div>
                    <div className="stat-subtext">{selectedAthlete.total_ratings || 0} review(s)</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-title">Location</div>
                    <div className="stat-value">{selectedAthlete.city || "-"}</div>
                    <div className="stat-subtext">{selectedAthlete.state || "-"}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-title">Minimum Payout</div>
                    <div className="stat-value">{selectedAthlete.minimum_payout || "Not set"}</div>
                    <div className="stat-subtext">per deal target</div>
                  </div>
                </div>

                <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                  <div><strong>Who They Are:</strong> {selectedAthlete.bio || "No bio added yet."}</div>
                  <div><strong>Interests:</strong> {selectedAthlete.deal_types || "No deal interests listed."}</div>
                  <div><strong>Preferred Company Type:</strong> {selectedAthlete.preferred_company_type || "No preference listed."}</div>
                  <div><strong>Instagram:</strong> {selectedAthlete.instagram || "Not provided"}</div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="secondary-button" onClick={() => setProfileModalAthleteId(null)}>Close</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
