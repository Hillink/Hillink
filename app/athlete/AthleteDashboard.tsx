"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  getNextTierGoal,
  getTierFromXp,
  getTierRewards,
  type XpAction,
} from "@/lib/xp";
import { formatMilesLabel, locationKey, milesBetween, normalizeLocationPart, storedCoords, type LatLng } from "@/lib/location";
import NotificationBell from "@/components/NotificationBell";
import type { LeaderboardEntry } from "@/app/api/athlete/leaderboard/route";

const CAMPAIGN_TYPE_LABELS: Record<string, string> = {
  basic_post: "Instagram Post",
  story_pack: "Story / Reel",
  reel_boost: "TikTok Post",
  event_appearance: "Event Appearance",
  brand_ambassador: "Brand Ambassador",
};

type Campaign = {
  id: string;
  title: string;
  campaign_type: string;
  deliverables: string;
  additional_compensation: string | null;
  preferred_tier: "Bronze" | "Silver" | "Gold" | "Platinum" | "Diamond" | "Any";
  payout_cents: number;
  open_slots: number;
  auto_accept_enabled: boolean;
  auto_accept_radius_miles: number;
  start_date: string | null;
  location_text: string | null;
  due_date: string | null;
  status: "active" | "open" | "closed" | "completed" | "cancelled" | "draft" | "paused";
  business_id: string;
};

type Application = {
  id: string;
  campaign_id: string;
  athlete_id: string;
  status: "applied" | "accepted" | "declined" | "withdrawn" | "submitted" | "approved" | "rejected";
  proof_url: string | null;
  proof_notes: string | null;
  applied_at: string;
  decided_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
};

type DiagnosticsSnapshot = {
  application_id: string;
  likes: number;
  comments: number;
  saves: number;
  reach: number;
  impressions: number;
  video_views: number;
  diagnostics_status: "verified" | "mock" | "missing_connection" | "unverified" | "error";
  diagnostics_notes: string | null;
  last_synced_at: string | null;
};

type XpActivity = {
  id: string;
  action: XpAction;
  label: string;
  xp: number;
  at: string;
};

type XpEventRow = {
  id: string;
  action: string;
  xp_delta: number;
  created_at: string;
  details_json?: Record<string, unknown> | null;
};

type CompletedChallenge = {
  id: string;
  title: string;
  xp: number;
  completedAt: string;
};

type AthleteProfile = {
  first_name?: string | null;
  last_name?: string | null;
  school?: string | null;
  sport?: string | null;
  city?: string | null;
  state?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  deal_types?: string | null;
  bio?: string | null;
  average_rating?: number | null;
  total_ratings?: number | null;
  profile_photo_url?: string | null;
  minimum_payout?: string | null;
  instagram?: string | null;
  preferred_company_type?: string | null;
};

type CoAthlete = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  school: string | null;
  sport: string | null;
  city: string | null;
  state: string | null;
  profile_photo_url: string | null;
  tier: string;
};

type BusinessProfile = {
  id: string;
  business_name?: string | null;
  description?: string | null;
  campaign_interests?: string | null;
  category?: string | null;
  city?: string | null;
  state?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  instagram?: string | null;
  budget?: string | null;
  preferred_tiers?: string | null;
};

type AthleteDashboardProps = {
  initialXp?: number;
};

const TIER_MIN_XP = {
  Bronze: 0,
  Silver: 1000,
  Gold: 2500,
  Platinum: 5000,
  Diamond: 8000,
} as const;

const XP_LABELS: Record<XpAction, string> = {
  accept_campaign: "Accepted campaign",
  complete_campaign: "Completed campaign",
  early_completion_bonus: "Early completion bonus",
  upload_proof: "Uploaded proof",
  approved_post: "Approved post",
  five_star_rating: "Five-star rating",
  repeat_business_bonus: "Repeat business bonus",
  complete_profile: "Completed profile",
  connect_instagram: "Connected Instagram",
  connect_tiktok: "Connected TikTok",
  refer_athlete_signup: "Referred athlete signup",
  refer_business_signup: "Referred business signup",
  referred_user_first_completion: "Referral first completion bonus",
  weekly_activity_streak: "Weekly activity streak",
  monthly_activity_streak: "Monthly activity streak",
};

function rowLabel(status: Application["status"]): string {
  if (status === "accepted") return "Accepted - upload proof when complete";
  if (status === "submitted") return "Proof submitted - waiting business review";
  if (status === "approved") return "Approved";
  if (status === "declined") return "Declined";
  if (status === "rejected") return "Rejected";
  if (status === "withdrawn") return "Withdrawn";
  return "Applied";
}

function canJoinCampaignAtTier(currentTier: string, preferredTier: Campaign["preferred_tier"]): boolean {
  if (preferredTier === "Any") return true;
  const rank: Record<string, number> = {
    Bronze: 1,
    Silver: 2,
    Gold: 3,
    Platinum: 4,
    Diamond: 5,
  };
  return (rank[currentTier] || 0) >= (rank[preferredTier] || 0);
}

export default function AthleteDashboard({ initialXp = 0 }: AthleteDashboardProps) {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authError, setAuthError] = useState("");
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [businessById, setBusinessById] = useState<Record<string, BusinessProfile>>({});
  const [athleteProfile, setAthleteProfile] = useState<AthleteProfile | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [campaignModalId, setCampaignModalId] = useState<string | null>(null);
  const [applyingCampaignId, setApplyingCampaignId] = useState<string | null>(null);
  const [submittingAppId, setSubmittingAppId] = useState<string | null>(null);
  const [withdrawingAppId, setWithdrawingAppId] = useState<string | null>(null);
  const [proofInputs, setProofInputs] = useState<Record<string, { url: string; notes: string }>>({});
  const [athleteXp, setAthleteXp] = useState(initialXp);
  const [recentXpActivity, setRecentXpActivity] = useState<XpActivity[]>([]);
  const [infoMessage, setInfoMessage] = useState("");
  const [athleteRating, setAthleteRating] = useState<number | null>(null);
  const [diagnosticsByApplicationId, setDiagnosticsByApplicationId] = useState<Record<string, DiagnosticsSnapshot>>({});
  const [syncingDiagnosticsId, setSyncingDiagnosticsId] = useState<string | null>(null);
  const [completedChallenges, setCompletedChallenges] = useState<CompletedChallenge[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [coAthletesByAppId, setCoAthletesByAppId] = useState<Record<string, CoAthlete[]>>({});
  const [loadingCoAthletes, setLoadingCoAthletes] = useState<Record<string, boolean>>({});
  const [expandedCoAthletes, setExpandedCoAthletes] = useState<Record<string, boolean>>({});
  const [campaignSearch, setCampaignSearch] = useState("");
  const [cfDealType, setCfDealType] = useState("");
  const [cfTier, setCfTier] = useState("");
  const [cfMinPayout, setCfMinPayout] = useState("");
  const [cfMaxPayout, setCfMaxPayout] = useState("");
  const [cfState, setCfState] = useState("");
  const [cfRadiusMiles, setCfRadiusMiles] = useState("");
  const [cfSort, setCfSort] = useState("nearest");

  const locationCoords = useMemo(() => {
    const next: Record<string, LatLng | null> = {};
    const athleteKey = locationKey(athleteProfile?.city, athleteProfile?.state);
    if (athleteKey) {
      const coords = storedCoords(athleteProfile?.latitude, athleteProfile?.longitude);
      if (coords) next[athleteKey] = coords;
    }

    for (const biz of Object.values(businessById)) {
      const key = locationKey(biz.city, biz.state);
      if (!key) continue;
      const coords = storedCoords(biz.latitude, biz.longitude);
      if (coords) next[key] = coords;
    }

    return next;
  }, [athleteProfile?.city, athleteProfile?.state, athleteProfile?.latitude, athleteProfile?.longitude, businessById]);

  function scrollToSection(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }

  const loadData = async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError("");
    }

    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;

    if (!user) {
      router.push("/login");
      return;
    }

    const { data: profileRole } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profileRole) {
      setError("Unable to verify your account role right now.");
      setLoading(false);
      return;
    }

    if (profileRole.role !== "athlete") {
      router.push("/role-redirect");
      return;
    }

    const [campaignRes, appRes, xpRes, athleteProfileRes] = await Promise.all([
      supabase
        .from("campaigns")
        .select("id, title, campaign_type, deliverables, additional_compensation, preferred_tier, payout_cents, open_slots, auto_accept_enabled, auto_accept_radius_miles, start_date, location_text, due_date, status, business_id")
        .or("status.eq.active,status.eq.open")
        .order("created_at", { ascending: false }),
      supabase
        .from("campaign_applications")
        .select("id, campaign_id, athlete_id, status, proof_url, proof_notes, applied_at, decided_at, submitted_at, reviewed_at")
        .eq("athlete_id", user.id)
        .order("applied_at", { ascending: false }),
      supabase
        .from("athlete_xp_events")
        .select("id, action, xp_delta, created_at, details_json")
        .eq("athlete_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("athlete_profiles")
        .select("first_name, last_name, school, sport, city, state, latitude, longitude, deal_types, bio, average_rating, total_ratings, profile_photo_url, minimum_payout, instagram, preferred_company_type")
        .eq("id", user.id)
        .single(),
    ]);

    if (campaignRes.error) {
      setError(campaignRes.error.message);
      setLoading(false);
      return;
    }

    if (appRes.error) {
      setError(appRes.error.message);
      setLoading(false);
      return;
    }

    const openCampaigns = (campaignRes.data || []) as Campaign[];
    const loadedApplications = (appRes.data || []) as Application[];
    const campaignIds = Array.from(new Set(loadedApplications.map((a) => a.campaign_id)));

    let mergedCampaigns = openCampaigns;
    if (campaignIds.length > 0) {
      const { data: relatedCampaigns, error: relatedCampaignError } = await supabase
        .from("campaigns")
        .select("id, title, campaign_type, deliverables, additional_compensation, preferred_tier, payout_cents, open_slots, auto_accept_enabled, auto_accept_radius_miles, start_date, location_text, due_date, status, business_id")
        .in("id", campaignIds);

      if (relatedCampaignError) {
        setError(relatedCampaignError.message);
        setLoading(false);
        return;
      }

      const map = new Map<string, Campaign>();
      for (const c of openCampaigns) map.set(c.id, c);
      for (const c of (relatedCampaigns || []) as Campaign[]) map.set(c.id, c);
      mergedCampaigns = Array.from(map.values());
    }

    setCampaigns(mergedCampaigns);
    setApplications(loadedApplications);

    if (loadedApplications.length > 0) {
      const { data: diagnosticsRows, error: diagnosticsError } = await supabase
        .from("instagram_post_diagnostics")
        .select("application_id, likes, comments, saves, reach, impressions, video_views, diagnostics_status, diagnostics_notes, last_synced_at")
        .in("application_id", loadedApplications.map((a) => a.id));

      if (diagnosticsError && !diagnosticsError.message.toLowerCase().includes("instagram_post_diagnostics")) {
        setError(diagnosticsError.message);
        setLoading(false);
        return;
      }

      const nextDiagnostics: Record<string, DiagnosticsSnapshot> = {};
      for (const row of (diagnosticsRows || []) as DiagnosticsSnapshot[]) {
        nextDiagnostics[row.application_id] = row;
      }
      setDiagnosticsByApplicationId(nextDiagnostics);
    } else {
      setDiagnosticsByApplicationId({});
    }

    const businessIds = Array.from(new Set(mergedCampaigns.map((c) => c.business_id)));
    if (businessIds.length) {
      const { data: businessRows, error: businessError } = await supabase
        .from("business_profiles")
        .select("id, business_name, description, campaign_interests, category, city, state, latitude, longitude, instagram, budget, preferred_tiers")
        .in("id", businessIds);

      if (!businessError) {
        const nextBusiness: Record<string, BusinessProfile> = {};
        for (const row of businessRows || []) {
          const b = row as BusinessProfile;
          nextBusiness[b.id] = b;
        }
        setBusinessById(nextBusiness);
      }
    }

    const nextProof: Record<string, { url: string; notes: string }> = {};
    for (const app of loadedApplications) {
      nextProof[app.id] = {
        url: app.proof_url || "",
        notes: app.proof_notes || "",
      };
    }
    setProofInputs(nextProof);

    const hydrateXpRows = (rows: XpEventRow[]) => {
      const totalXp = rows.reduce((sum, row) => sum + (row.xp_delta || 0), 0);
      setAthleteXp(totalXp);
      setRecentXpActivity(
        rows.slice(0, 8).map((row) => {
          const action = row.action as XpAction;
          return {
            id: row.id,
            action,
            label: XP_LABELS[action] || row.action,
            xp: row.xp_delta,
            at: row.created_at,
          };
        })
      );
      // Extract completed challenges from XP events
      const done: CompletedChallenge[] = [];
      for (const row of rows) {
        const d = row.details_json;
        if (
          d &&
          d.source === "xp_challenge" &&
          typeof d.challenge_id === "string" &&
          typeof d.challenge_title === "string"
        ) {
          done.push({
            id: d.challenge_id,
            title: d.challenge_title,
            xp: row.xp_delta,
            completedAt: row.created_at,
          });
        }
      }
      setCompletedChallenges(done);
    };

    if (xpRes.error) {
      if (!xpRes.error.message.toLowerCase().includes("athlete_xp_events")) {
        setError(xpRes.error.message);
        setLoading(false);
        return;
      }
      setAthleteXp(initialXp);
      setRecentXpActivity([]);
    } else {
      hydrateXpRows((xpRes.data || []) as XpEventRow[]);
    }

    setCurrentUserId(user.id);

    if (!athleteProfileRes.error && athleteProfileRes.data) {
      const profile = athleteProfileRes.data as AthleteProfile;
      setAthleteProfile(profile);
      setAthleteRating(profile.average_rating || null);
    }

    const challengeSyncResponse = await fetch("/api/athlete/sync-xp-challenges", {
      method: "POST",
    });

    if (challengeSyncResponse.ok) {
      const challengeSyncData = (await challengeSyncResponse.json()) as {
        granted?: number;
        grantedTitles?: string[];
      };

      if ((challengeSyncData.granted || 0) > 0) {
        const { data: refreshedXpRows, error: refreshedXpError } = await supabase
          .from("athlete_xp_events")
          .select("id, action, xp_delta, created_at, details_json")
          .eq("athlete_id", user.id)
          .order("created_at", { ascending: false })
          .limit(100);

        if (!refreshedXpError) {
          hydrateXpRows((refreshedXpRows || []) as XpEventRow[]);
        }

        if (!silent && challengeSyncData.grantedTitles?.length) {
          setInfoMessage(`Challenge XP awarded: ${challengeSyncData.grantedTitles.join(", ")}`);
        }
      }
    }

    setLoading(false);
  };

  const loadLeaderboard = async () => {
    setLeaderboardLoading(true);
    try {
      const res = await fetch("/api/athlete/leaderboard");
      if (res.ok) {
        const data = (await res.json()) as { leaderboard: LeaderboardEntry[] };
        setLeaderboard(data.leaderboard ?? []);
      }
    } finally {
      setLeaderboardLoading(false);
    }
  };

  const loadCoAthletes = async (applicationId: string, campaignId: string) => {
    setLoadingCoAthletes((prev) => ({ ...prev, [applicationId]: true }));
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/co-athletes`);
      if (res.ok) {
        const data = (await res.json()) as CoAthlete[];
        setCoAthletesByAppId((prev) => ({ ...prev, [applicationId]: data }));
      }
    } finally {
      setLoadingCoAthletes((prev) => ({ ...prev, [applicationId]: false }));
    }
  };

  useEffect(() => {
    loadData();
    loadLeaderboard();
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadData(true);
    }, 20000);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        loadData(true);
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

  const applyToCampaign = async (campaignId: string) => {
    setError("");
    setInfoMessage("");
    setApplyingCampaignId(campaignId);

    if (athleteRating !== null && athleteRating < 1.5) {
      setApplyingCampaignId(null);
      setError(`Your current rating is ${athleteRating.toFixed(2)} stars. You must have a rating of at least 1.5 stars to apply for campaigns.`);
      return;
    }

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setApplyingCampaignId(null);
      router.push("/login");
      return;
    }

    const response = await fetch(`/api/campaigns/${campaignId}/apply`, {
      method: "POST",
    });

    const data = await response.json();

    setApplyingCampaignId(null);

    if (!response.ok) {
      const message = (data?.error as string) || "Failed to apply.";
      if (response.status === 409 || message.toLowerCase().includes("already applied")) {
        setError("You already applied to this campaign.");
      } else {
        const reason = typeof data?.reason === "string" ? data.reason : "";
        setError(reason ? `${message} (${reason})` : message);
      }
      return;
    }

    setInfoMessage("You're in!");
    await loadData(true);
  };

  const submitProof = async (application: Application) => {
    const proof = proofInputs[application.id];
    if (!proof?.url.trim()) {
      setError("Proof URL is required.");
      return;
    }

    setError("");
    setInfoMessage("");
    setSubmittingAppId(application.id);

    const response = await fetch("/api/athlete/submit-proof", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicationId: application.id,
        proofUrl: proof.url.trim(),
        proofNotes: proof.notes.trim() || null,
      }),
    });

    const data = await response.json();

    setSubmittingAppId(null);

    if (!response.ok) {
      setError(data.error || "Failed to submit proof.");
      return;
    }

    if (data.warning) {
      setInfoMessage(data.warning);
    } else if (data.diagnostics?.status === "verified") {
      setInfoMessage("Proof submitted and Instagram diagnostics verified.");
    } else {
      setInfoMessage("Proof submitted. Diagnostics captured.");
    }

    await loadData(true);
  };

  const withdrawApplication = async (application: Application) => {
    const ok = window.confirm("Drop this campaign/application?");
    if (!ok) return;

    setError("");
    setWithdrawingAppId(application.id);

    const response = await fetch("/api/athlete/withdraw-application", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId: application.id }),
    });

    const data = await response.json();
    setWithdrawingAppId(null);

    if (!response.ok) {
      setError(data.error || "Failed to drop campaign.");
      return;
    }

    setApplications((prev) => prev.filter((a) => a.id !== application.id));
    setDiagnosticsByApplicationId((prev) => {
      const next = { ...prev };
      delete next[application.id];
      return next;
    });
    setProofInputs((prev) => {
      const next = { ...prev };
      delete next[application.id];
      return next;
    });

    await loadData(true);
  };

  const syncDiagnostics = async (applicationId: string) => {
    setError("");
    setSyncingDiagnosticsId(applicationId);

    const response = await fetch("/api/instagram/sync-diagnostics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId }),
    });

    const data = await response.json();
    setSyncingDiagnosticsId(null);

    if (!response.ok) {
      setError(data.error || "Failed to sync diagnostics.");
      return;
    }

    await loadData(true);
  };

  const openCampaigns = useMemo(() => campaigns.filter((c) => c.status === "open"), [campaigns]);

  const availableStates = useMemo(() => {
    const states = new Set<string>();
    for (const biz of Object.values(businessById)) {
      if (biz.state) states.add(biz.state.trim());
    }
    return Array.from(states).sort();
  }, [businessById]);

  const filteredCampaigns = useMemo(() => {
    const minRaw = parseFloat(cfMinPayout);
    const maxRaw = parseFloat(cfMaxPayout);
    const hasMin = !isNaN(minRaw);
    const hasMax = !isNaN(maxRaw);
    const floor = hasMin && hasMax ? Math.min(minRaw, maxRaw) : hasMin ? minRaw : null;
    const ceiling = hasMin && hasMax ? Math.max(minRaw, maxRaw) : hasMax ? maxRaw : null;

    const radius = parseFloat(cfRadiusMiles);
    const useRadius = !isNaN(radius) && radius > 0;
    const athleteLocKey = locationKey(athleteProfile?.city, athleteProfile?.state);
    const athleteCoords = athleteLocKey ? locationCoords[athleteLocKey] : null;

    return openCampaigns.filter((c) => {
      if (campaignSearch) {
        const q = campaignSearch.toLowerCase();
        if (!c.title.toLowerCase().includes(q) && !c.deliverables.toLowerCase().includes(q)) return false;
      }
      if (cfDealType && c.campaign_type !== cfDealType) return false;
      if (cfTier && c.preferred_tier !== "Any" && c.preferred_tier !== cfTier) return false;
      if (floor !== null && c.payout_cents / 100 < floor) return false;
      if (ceiling !== null && c.payout_cents / 100 > ceiling) return false;
      if (cfState) {
        const biz = businessById[c.business_id];
        if (!biz?.state || normalizeLocationPart(biz.state) !== normalizeLocationPart(cfState)) return false;
      }
      if (useRadius) {
        const biz = businessById[c.business_id];
        const bizLocKey = locationKey(biz?.city, biz?.state);
        if (!athleteCoords || !bizLocKey) return false;
        const bizCoords = locationCoords[bizLocKey];
        if (!bizCoords) return false;
        if (milesBetween(athleteCoords, bizCoords) > radius) return false;
      }
      return true;
    });
  }, [
    openCampaigns,
    campaignSearch,
    cfDealType,
    cfTier,
    cfMinPayout,
    cfMaxPayout,
    cfState,
    cfRadiusMiles,
    businessById,
    athleteProfile?.city,
    athleteProfile?.state,
    locationCoords,
  ]);

  const campaignDistanceById = useMemo(() => {
    const athleteLocKey = locationKey(athleteProfile?.city, athleteProfile?.state);
    const athleteCoords = athleteLocKey ? locationCoords[athleteLocKey] : null;
    if (!athleteCoords) return {} as Record<string, number>;

    const next: Record<string, number> = {};
    for (const campaign of filteredCampaigns) {
      const business = businessById[campaign.business_id];
      const bizLocKey = locationKey(business?.city, business?.state);
      const bizCoords = bizLocKey ? locationCoords[bizLocKey] : null;
      if (bizCoords) next[campaign.id] = milesBetween(athleteCoords, bizCoords);
    }
    return next;
  }, [filteredCampaigns, businessById, athleteProfile?.city, athleteProfile?.state, locationCoords]);

  const sortedCampaigns = useMemo(() => {
    const next = [...filteredCampaigns];
    if (cfSort === "payout_desc") {
      next.sort((a, b) => b.payout_cents - a.payout_cents);
      return next;
    }
    if (cfSort === "payout_asc") {
      next.sort((a, b) => a.payout_cents - b.payout_cents);
      return next;
    }
    if (cfSort === "tier_desc") {
      const order = { Any: 6, Diamond: 5, Platinum: 4, Gold: 3, Silver: 2, Bronze: 1 };
      next.sort((a, b) => order[b.preferred_tier] - order[a.preferred_tier]);
      return next;
    }
    if (cfSort === "nearest") {
      next.sort((a, b) => {
        const left = campaignDistanceById[a.id] ?? Number.POSITIVE_INFINITY;
        const right = campaignDistanceById[b.id] ?? Number.POSITIVE_INFINITY;
        return left - right;
      });
    }
    return next;
  }, [filteredCampaigns, cfSort, campaignDistanceById]);

  const appliedByCampaignId = useMemo(() => {
    const map: Record<string, Application> = {};
    for (const app of applications) {
      if (app.status === "withdrawn") continue;
      if (!map[app.campaign_id]) {
        // applications are sorted newest first; keep the first row per campaign.
        map[app.campaign_id] = app;
      }
    }
    return map;
  }, [applications]);

  const visibleApplications = useMemo(
    () => applications.filter((a) => a.status !== "withdrawn"),
    [applications]
  );

  const activeApplications = applications.filter(
    (a) => a.status === "accepted" || a.status === "submitted" || a.status === "approved"
  );

  const appliedCount = applications.filter((a) => a.status === "applied").length;
  const approvedCount = applications.filter((a) => a.status === "approved").length;
  const currentTier = getTierFromXp(athleteXp);
  const nextTierGoal = getNextTierGoal(athleteXp);
  const currentTierMin = TIER_MIN_XP[currentTier];
  const progressSpan = nextTierGoal.goalXp ? nextTierGoal.goalXp - currentTierMin : 1;
  const progressWithinTier = nextTierGoal.goalXp
    ? Math.min(100, Math.max(0, ((athleteXp - currentTierMin) / progressSpan) * 100))
    : 100;
  const unlockedTierRewards = getTierRewards(currentTier);
  const verifiedDiagnosticsCount = Object.values(diagnosticsByApplicationId).filter((d) => d.diagnostics_status === "verified").length;
  const submittedCount = applications.filter((a) => a.status === "submitted" || a.status === "approved" || a.status === "rejected").length;
  const activeCampaignParticipation = applications.filter((a) => a.status !== "withdrawn" && a.status !== "declined").length;

  const challenges = [
    {
      id: "apply-3",
      title: "Campaign Starter",
      description: "Join 3 campaigns",
      progress: activeCampaignParticipation,
      target: 3,
      reward: 75,
    },
    {
      id: "proof-2",
      title: "Proof Pro",
      description: "Submit proof for 2 campaigns",
      progress: submittedCount,
      target: 2,
      reward: 60,
    },
    {
      id: "diagnostics-1",
      title: "Diagnostics Verified",
      description: "Get 1 verified diagnostics report",
      progress: verifiedDiagnosticsCount,
      target: 1,
      reward: 50,
    },
    {
      id: "approved-2",
      title: "Closer",
      description: "Get 2 campaign approvals",
      progress: approvedCount,
      target: 2,
      reward: 120,
    },
  ];

  if (loading) {
    return (
      <div className="auth-shell">
        <div className="auth-card">Loading athlete dashboard...</div>
      </div>
    );
  }

  const selectedCampaign = campaignModalId ? campaigns.find((c) => c.id === campaignModalId) || null : null;
  const selectedBusiness = selectedCampaign ? businessById[selectedCampaign.business_id] : null;

  return (
    <div className="portal-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <img src="/Hillink-logo-black-red.png" alt="HILLink" className="sidebar-logo" />
          </div>

          <nav className="sidebar-nav">
            <button className="sidebar-link active" onClick={() => scrollToSection("athlete-top")}> 
              <span className="sidebar-icon">⌂</span>
              <span>Home</span>
            </button>
            <button className="sidebar-link" onClick={() => scrollToSection("find-campaigns")}>
              <span className="sidebar-icon">⌕</span>
              <span>Find Campaigns</span>
            </button>
            <button className="sidebar-link" onClick={() => scrollToSection("active-deals")}>
              <span className="sidebar-icon">◫</span>
              <span>My Campaigns</span>
            </button>
            <button className="sidebar-link" onClick={() => { scrollToSection("leaderboard"); loadLeaderboard(); }}>
              <span className="sidebar-icon">🏆</span>
              <span>Leaderboard</span>
            </button>
            <button className="sidebar-link" onClick={() => scrollToSection("my-profile")}>
              <span className="sidebar-icon">👤</span>
              <span>My Profile</span>
            </button>
            <button className="sidebar-link" onClick={() => router.push("/settings")}>
              <span className="sidebar-icon">⚙</span>
              <span>Settings</span>
            </button>
          </nav>
        </div>
      </aside>

      <main className="portal-main" id="athlete-top">
        <div className="topbar">
          <h1 className="page-title">Athlete Portal</h1>
          <div className="topbar-actions">
            <NotificationBell />
            <button className="secondary-button" onClick={handleLogout} disabled={signOutLoading}>
              {signOutLoading ? "Signing out..." : "Log out"}
            </button>
          </div>
        </div>

        {authError && <div className="error-message">Logout error: {authError}</div>}
        {error && <div className="error-message">{error}</div>}
        {infoMessage && <div className="success-message">{infoMessage}</div>}

        <section className="stats-grid four">
          <div className="stat-card">
            <div className="stat-title">Open Campaigns</div>
            <div className="stat-value">{openCampaigns.length}</div>
            <div className="stat-subtext">available to apply</div>
          </div>
          <div className="stat-card">
            <div className="stat-title">Applications</div>
            <div className="stat-value">{appliedCount}</div>
            <div className="stat-subtext">awaiting business decision</div>
          </div>
          <div className="stat-card">
            <div className="stat-title">Active Deals</div>
            <div className="stat-value">{activeApplications.length}</div>
            <div className="stat-subtext">accepted or submitted</div>
          </div>
          <div className="stat-card">
            <div className="stat-title">Approved Campaigns</div>
            <div className="stat-value">{approvedCount}</div>
            <div className="stat-subtext">proof approved by business</div>
          </div>
        </section>

        <section className="stats-grid three" style={{ marginTop: 18 }}>
          <div className="stat-card accent">
            <div className="stat-title">Current XP</div>
            <div className="stat-value">{athleteXp}</div>
            <div className="stat-subtext">earned from campaigns and platform actions</div>
          </div>
          <div className="stat-card">
            <div className="stat-title">Current Tier</div>
            <div className="stat-value">{currentTier}</div>
            <div className="stat-subtext">tier updates automatically from XP</div>
          </div>
          <div className="stat-card">
            <div className="stat-title">Next Tier Goal</div>
            <div className="stat-value">{nextTierGoal.goalXp ? nextTierGoal.goalXp : "MAX"}</div>
            <div className="stat-subtext">
              {nextTierGoal.nextTier
                ? `${nextTierGoal.remainingXp} XP to ${nextTierGoal.nextTier}`
                : "You are at the highest tier"}
            </div>
          </div>
          <div className="stat-card" style={{ gridColumn: "1 / -1" }}>
            <div className="stat-title">Your Rating</div>
            <div className="stat-value">
              {athleteRating !== null ? `${athleteRating.toFixed(2)} ★` : "No ratings yet"}
            </div>
            <div className="stat-subtext">
              {athleteRating !== null && athleteRating < 1.5
                ? "Rating below 1.5 stars: improve delivery quality to regain campaign eligibility"
                : athleteRating !== null
                  ? "Earn strong ratings by delivering campaign requirements"
                  : "Ratings from businesses appear here after campaign completion"}
            </div>
          </div>
        </section>

        <section className="panel" style={{ marginTop: 20 }}>
          <div className="panel-header">
            <h2>XP Progress</h2>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progressWithinTier}%` }} />
          </div>
          <p className="panel-note" style={{ marginBottom: 0 }}>
            {nextTierGoal.nextTier
              ? `${athleteXp} XP total. ${nextTierGoal.remainingXp} XP until ${nextTierGoal.nextTier}.`
              : `${athleteXp} XP total. You have reached the highest tier.`}
          </p>
        </section>

        <div className="xp-grid">
          <section className="panel">
            <div className="panel-header">
              <h2>Recent XP Activity</h2>
            </div>
            {recentXpActivity.length === 0 ? (
              <p className="panel-note">No XP events yet. Start by applying to a campaign and submitting proof.</p>
            ) : (
              <div className="xp-activity-list">
                {recentXpActivity.map((activity) => (
                  <div className="xp-activity-item" key={activity.id}>
                    <div>
                      <strong>{activity.label}</strong>
                      <div className="xp-activity-time">{new Date(activity.at).toLocaleString()}</div>
                    </div>
                    <div className="xp-activity-xp">+{activity.xp} XP</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>XP Challenges</h2>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {challenges.map((challenge) => {
                const pct = Math.min(100, Math.round((challenge.progress / challenge.target) * 100));
                const completed = challenge.progress >= challenge.target;
                return (
                  <div key={challenge.id} style={{ border: "1px solid #ececec", borderRadius: 10, padding: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <strong>{challenge.title}</strong>
                      <span style={{ color: completed ? "#0a7f2e" : "#666", fontSize: 12 }}>
                        {completed ? "Completed" : `${challenge.progress}/${challenge.target}`}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>{challenge.description}</div>
                    <div className="progress-track" style={{ marginTop: 8 }}>
                      <div className="progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>Reward: {challenge.reward} XP</div>
                  </div>
                );
              })}
            </div>

            {completedChallenges.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#6d28d9", marginBottom: 8 }}>◆ Unlocked Rewards</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {completedChallenges.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: "#f5f3ff",
                        border: "1px solid #ddd6fe",
                        borderRadius: 8,
                        padding: "7px 10px",
                        fontSize: 13,
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 600, color: "#4c1d95" }}>{c.title}</span>
                        <div style={{ fontSize: 11, color: "#7c3aed", marginTop: 2 }}>
                          {new Date(c.completedAt).toLocaleDateString()}
                        </div>
                      </div>
                      <span style={{ fontWeight: 700, color: "#6d28d9", fontSize: 13 }}>+{c.xp} XP</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        <section id="my-profile" className="panel" style={{ marginTop: 18 }}>
          <div className="panel-header">
            <h2>My Profile</h2>
            <button className="secondary-button" style={{ marginLeft: "auto" }} onClick={() => router.push("/settings")}>
              Edit Profile
            </button>
          </div>

          {/* Hero */}
          <div
            style={{
              display: "flex",
              gap: 24,
              alignItems: "flex-start",
              background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)",
              borderRadius: 12,
              padding: "28px 24px",
              color: "#fff",
              marginBottom: 20,
            }}
          >
            <div style={{ flexShrink: 0 }}>
              <img
                src={
                  athleteProfile?.profile_photo_url ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(
                    [athleteProfile?.first_name, athleteProfile?.last_name].filter(Boolean).join(" ") || "Athlete"
                  )}&background=ef233c&color=fff&size=160`
                }
                alt="Profile"
                style={{ width: 100, height: 100, borderRadius: "50%", objectFit: "cover", border: "3px solid rgba(255,255,255,0.3)" }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.1 }}>
                {[athleteProfile?.first_name, athleteProfile?.last_name].filter(Boolean).join(" ") || "Your Name"}
              </div>
              <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                {currentTier && (
                  <span
                    style={{
                      background:
                        currentTier === "Diamond" ? "#a855f7" :
                        currentTier === "Platinum" ? "#6b7280" :
                        currentTier === "Gold" ? "#d97706" :
                        currentTier === "Silver" ? "#9ca3af" :
                        "#b45309",
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "3px 10px",
                      borderRadius: 20,
                      letterSpacing: 0.5,
                    }}
                  >
                    {currentTier}
                  </span>
                )}
                {athleteProfile?.sport && (
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.8)" }}>{athleteProfile.sport}</span>
                )}
                {athleteProfile?.school && (
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>@ {athleteProfile.school}</span>
                )}
              </div>
              {(athleteProfile?.city || athleteProfile?.state) && (
                <div style={{ marginTop: 6, fontSize: 13, color: "rgba(255,255,255,0.65)" }}>
                  📍 {[athleteProfile.city, athleteProfile.state].filter(Boolean).join(", ")}
                </div>
              )}
              {athleteProfile?.average_rating != null && (
                <div style={{ marginTop: 4, fontSize: 13, color: "rgba(255,255,255,0.65)" }}>
                  ★ {Number(athleteProfile.average_rating).toFixed(2)} ({athleteProfile.total_ratings || 0} review{athleteProfile.total_ratings === 1 ? "" : "s"})
                </div>
              )}
              {athleteProfile?.bio && (
                <div style={{ marginTop: 10, fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.5, maxWidth: 520 }}>
                  {athleteProfile.bio}
                </div>
              )}
            </div>
            <div style={{ flexShrink: 0, textAlign: "right" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#ef233c" }}>{athleteXp.toLocaleString()}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>XP</div>
            </div>
          </div>

          {/* Details grid */}
          <div className="stats-grid four" style={{ marginBottom: 16 }}>
            <div className="stat-card">
              <div className="stat-title">School</div>
              <div className="stat-value" style={{ fontSize: 15 }}>{athleteProfile?.school || "—"}</div>
            </div>
            <div className="stat-card">
              <div className="stat-title">Sport</div>
              <div className="stat-value" style={{ fontSize: 15 }}>{athleteProfile?.sport || "—"}</div>
            </div>
            <div className="stat-card">
              <div className="stat-title">Location</div>
              <div className="stat-value" style={{ fontSize: 15 }}>{athleteProfile?.city || "—"}</div>
              <div className="stat-subtext">{athleteProfile?.state || ""}</div>
            </div>
            <div className="stat-card">
              <div className="stat-title">Rating</div>
              <div className="stat-value" style={{ fontSize: 15 }}>
                {athleteProfile?.average_rating != null ? `${Number(athleteProfile.average_rating).toFixed(2)} ★` : "No ratings"}
              </div>
              <div className="stat-subtext">{athleteProfile?.total_ratings || 0} review(s)</div>
            </div>
          </div>

          <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
            {athleteProfile?.deal_types && (
              <div>
                <span style={{ fontWeight: 600 }}>Deal Preferences:&nbsp;</span>
                <span style={{ color: "var(--muted)", fontSize: 14 }}>{athleteProfile.deal_types}</span>
              </div>
            )}
            {athleteProfile?.preferred_company_type && (
              <div>
                <span style={{ fontWeight: 600 }}>Preferred Brand Type:&nbsp;</span>
                <span style={{ color: "var(--muted)", fontSize: 14 }}>{athleteProfile.preferred_company_type}</span>
              </div>
            )}
            {athleteProfile?.instagram ? (
              <div>
                <span style={{ fontWeight: 600 }}>Instagram:&nbsp;</span>
                <a
                  href={`https://instagram.com/${athleteProfile.instagram.replace(/^@/, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#dc2626", fontSize: 14 }}
                >
                  @{athleteProfile.instagram.replace(/^@/, "")}
                </a>
                <div style={{ fontSize: 13, color: '#166534', marginTop: 4, maxWidth: 420 }}>
                  <strong>Tip:</strong> For best results and to unlock full analytics, connect an <strong>Instagram Business or Creator account</strong> linked to a Facebook Page. <a href="https://help.instagram.com/502981923235522" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'underline' }}>Learn how</a>.
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#b91c1c', marginTop: 4, maxWidth: 420 }}>
                <strong>Connect your Instagram account</strong> to unlock campaign eligibility and post-performance analytics. <br />
                <span style={{ color: '#166534' }}>
                  For best results, use an <strong>Instagram Business or Creator account</strong> linked to a Facebook Page. <a href="https://help.instagram.com/502981923235522" target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'underline' }}>Learn how</a>.
                </span>
              </div>
            )}
          </div>

          {unlockedTierRewards.length > 0 && (
            <>
              <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>Tier Rewards Unlocked</div>
              <ul className="tier-reward-list">
                {unlockedTierRewards.map((reward) => (
                  <li key={reward}>{reward}</li>
                ))}
              </ul>
            </>
          )}

          {!athleteProfile?.bio && !athleteProfile?.sport && !athleteProfile?.school && (
            <p style={{ color: "var(--muted)", fontSize: 13 }}>
              Your profile is empty. <button className="ghost-button" style={{ color: "#dc2626", padding: 0 }} onClick={() => router.push("/settings")}>Complete your profile</button> so businesses can find you.
            </p>
          )}
        </section>

        <section id="find-campaigns" className="panel">
          <div className="panel-header">
            <h2>Campaign Marketplace</h2>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              {filteredCampaigns.length} of {openCampaigns.length} campaigns
            </span>
          </div>

          <div className="filter-bar">
            <input
              className="filter-input"
              placeholder="Search campaigns..."
              value={campaignSearch}
              onChange={(e) => setCampaignSearch(e.target.value)}
            />
            <select className="filter-select" value={cfDealType} onChange={(e) => setCfDealType(e.target.value)}>
              <option value="">All deal types</option>
              <option value="basic_post">Instagram Post</option>
              <option value="story_pack">Story / Reel</option>
              <option value="reel_boost">TikTok Post</option>
              <option value="event_appearance">Event Appearance</option>
              <option value="brand_ambassador">Brand Ambassador</option>
            </select>
            <select className="filter-select" value={cfTier} onChange={(e) => setCfTier(e.target.value)}>
              <option value="">All tiers</option>
              <option value="Bronze">Bronze</option>
              <option value="Silver">Silver</option>
              <option value="Gold">Gold</option>
              <option value="Platinum">Platinum</option>
              <option value="Diamond">Diamond</option>
            </select>
            <div className="filter-payout-range">
              <input
                className="filter-input filter-input-sm"
                placeholder="Min $"
                type="number"
                min="0"
                value={cfMinPayout}
                onChange={(e) => setCfMinPayout(e.target.value)}
              />
              <span className="filter-range-sep">&ndash;</span>
              <input
                className="filter-input filter-input-sm"
                placeholder="Max $"
                type="number"
                min="0"
                value={cfMaxPayout}
                onChange={(e) => setCfMaxPayout(e.target.value)}
              />
            </div>
            <select className="filter-select" value={cfState} onChange={(e) => setCfState(e.target.value)}>
              <option value="">All states</option>
              {availableStates.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select className="filter-select" value={cfSort} onChange={(e) => setCfSort(e.target.value)}>
              <option value="nearest">Nearest first</option>
              <option value="payout_desc">Highest payout</option>
              <option value="payout_asc">Lowest payout</option>
              <option value="tier_desc">Highest tier</option>
            </select>
            <input
              className="filter-input filter-input-sm"
              placeholder="Radius mi"
              type="number"
              min="1"
              value={cfRadiusMiles}
              onChange={(e) => setCfRadiusMiles(e.target.value)}
            />
            {(campaignSearch || cfDealType || cfTier || cfMinPayout || cfMaxPayout || cfState || cfRadiusMiles || cfSort !== "nearest") && (
              <button
                className="ghost-button"
                style={{ fontSize: 12, whiteSpace: "nowrap" }}
                onClick={() => { setCampaignSearch(""); setCfDealType(""); setCfTier(""); setCfMinPayout(""); setCfMaxPayout(""); setCfState(""); setCfRadiusMiles(""); setCfSort("nearest"); }}
              >
                Clear filters
              </button>
            )}
          </div>

          {cfRadiusMiles && !(athleteProfile?.city && athleteProfile?.state) && (
            <p className="panel-note" style={{ marginTop: 0 }}>
              Add your city and state in Settings to use radius filtering.
            </p>
          )}

          <div className="table-like">
            <div className="table-head six">
              <span>Campaign</span>
              <span>Type</span>
              <span>Tier</span>
              <span>Payout</span>
              <span>Business</span>
              <span>Action</span>
            </div>

            {sortedCampaigns.length === 0 && (
              <div style={{ padding: "20px 0", textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
                No campaigns match these filters.
              </div>
            )}

            {sortedCampaigns.map((campaign) => {
              const existing = appliedByCampaignId[campaign.id];
              const business = businessById[campaign.business_id];
              const distanceLabel = formatMilesLabel(campaignDistanceById[campaign.id]);
              const eligible = canJoinCampaignAtTier(currentTier, campaign.preferred_tier);
              const canApply = campaign.status === "active" && campaign.open_slots > 0;
              return (
                <div className="table-row six" key={campaign.id}>
                  <span>
                    <div>{campaign.title}</div>
                    {campaign.auto_accept_enabled && (
                      <div style={{ fontSize: 11, color: "#166534", fontWeight: 600 }}>
                        Auto-Accept ON • {campaign.auto_accept_radius_miles}mi radius
                      </div>
                    )}
                  </span>
                  <span>{CAMPAIGN_TYPE_LABELS[campaign.campaign_type] ?? campaign.campaign_type}</span>
                  <span>{campaign.preferred_tier}</span>
                  <span>${(campaign.payout_cents / 100).toFixed(0)}</span>
                  <span>
                    <button className="ghost-button" style={{ padding: 0, textAlign: "left" }} onClick={() => setCampaignModalId(campaign.id)}>
                      <div>{business?.business_name || "Business"}</div>
                      {business?.city && business?.state && (
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{business.city}, {business.state}</div>
                      )}
                      {distanceLabel && (
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>{distanceLabel}</div>
                      )}
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>View Campaign</div>
                    </button>
                  </span>
                  <span>
                    {existing ? (
                      <span>{existing.status}</span>
                    ) : !eligible ? (
                      <span style={{ color: "#b91c1c", fontSize: 12, fontWeight: 600 }}>not eligible for this payout yet</span>
                    ) : !canApply ? (
                      <span style={{ color: "#6b7280", fontSize: 12, fontWeight: 600 }}>unavailable</span>
                    ) : (
                      <button
                        className="small-button"
                        style={{ background: "#dc2626", color: "#fff", borderColor: "#dc2626" }}
                        disabled={applyingCampaignId === campaign.id || !canApply}
                        onClick={() => applyToCampaign(campaign.id)}
                      >
                        {applyingCampaignId === campaign.id ? "Joining..." : "Join"}
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section id="active-deals" className="panel">
          <div className="panel-header">
            <h2>My Campaigns and Proof Upload</h2>
          </div>

          {visibleApplications.length === 0 ? (
            <p>No campaign applications yet. Apply to campaigns to get started.</p>
          ) : (
            <div className="form-grid" style={{ marginTop: 12 }}>
              {visibleApplications.map((app) => {
                const campaign = campaigns.find((c) => c.id === app.campaign_id);
                const proof = proofInputs[app.id] || { url: "", notes: "" };
                const business = campaign ? businessById[campaign.business_id] : null;

                return (
                  <div className="mini-card" key={app.id} data-application-id={app.id}>
                    <h3 style={{ marginBottom: 8 }}>{campaign?.title || "Campaign"}</h3>
                    <p style={{ margin: 0, color: "#666" }}>{rowLabel(app.status)}</p>
                    <p style={{ marginTop: 8 }}>
                      <strong>Deliverables:</strong> {campaign?.deliverables || "-"}
                    </p>
                    {campaign?.status === "cancelled" && (
                      <p style={{ marginTop: 8, color: "#b91c1c", fontWeight: 600 }}>
                        This campaign has been cancelled by the business.
                      </p>
                    )}
                    <p style={{ marginTop: 6 }}>
                      <strong>Business:</strong>{" "}
                      <button className="ghost-button" style={{ padding: 0 }} onClick={() => campaign && setCampaignModalId(campaign.id)}>
                        {business?.business_name || "View Campaign"}
                      </button>
                    </p>

                    {(app.status === "accepted" || app.status === "submitted") && campaign?.status !== "cancelled" && (
                      <>
                        <label style={{ display: "block", marginTop: 8 }}>
                          Proof URL (post/story/reel link)
                          <input
                            value={proof.url}
                            onChange={(e) =>
                              setProofInputs((prev) => ({
                                ...prev,
                                [app.id]: { ...proof, url: e.target.value },
                              }))
                            }
                            placeholder="https://instagram.com/..."
                          />
                        </label>
                        <label style={{ display: "block", marginTop: 8 }}>
                          Notes
                          <input
                            value={proof.notes}
                            onChange={(e) =>
                              setProofInputs((prev) => ({
                                ...prev,
                                [app.id]: { ...proof, notes: e.target.value },
                              }))
                            }
                            placeholder="caption details, metrics, etc."
                          />
                        </label>
                      </>
                    )}

                    <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        className="cta-button"
                        disabled={app.status !== "accepted" || submittingAppId === app.id || campaign?.status === "cancelled"}
                        onClick={() => submitProof(app)}
                      >
                        {submittingAppId === app.id ? "Submitting..." : "Submit Proof"}
                      </button>

                      {(app.status === "applied" || app.status === "accepted" || app.status === "submitted") && (
                        <button
                          className="secondary-button"
                          disabled={withdrawingAppId === app.id}
                          onClick={() => withdrawApplication(app)}
                        >
                          {withdrawingAppId === app.id ? "Dropping..." : "Drop Campaign"}
                        </button>
                      )}

                      {app.proof_url && (
                        <button
                          className="secondary-button"
                          disabled={syncingDiagnosticsId === app.id}
                          onClick={() => syncDiagnostics(app.id)}
                        >
                          {syncingDiagnosticsId === app.id ? "Syncing..." : "Sync Diagnostics"}
                        </button>
                      )}
                    </div>

                    {diagnosticsByApplicationId[app.id] && (
                      <div style={{ marginTop: 10, fontSize: 12, color: "#666" }}>
                        <div>
                          <strong>Diagnostics:</strong> {diagnosticsByApplicationId[app.id].diagnostics_status}
                          {diagnosticsByApplicationId[app.id].last_synced_at
                            ? ` • ${new Date(diagnosticsByApplicationId[app.id].last_synced_at as string).toLocaleString()}`
                            : ""}
                        </div>
                        <div>
                          L {diagnosticsByApplicationId[app.id].likes} • C {diagnosticsByApplicationId[app.id].comments} • S {diagnosticsByApplicationId[app.id].saves} • R {diagnosticsByApplicationId[app.id].reach}
                        </div>
                        {diagnosticsByApplicationId[app.id].diagnostics_notes && (
                          <div>{diagnosticsByApplicationId[app.id].diagnostics_notes}</div>
                        )}
                      </div>
                    )}

                    {/* Fellow athletes in this campaign */}
                    {(app.status === "accepted" || app.status === "approved" || app.status === "submitted") && (
                      <div style={{ marginTop: 12 }}>
                        <button
                          className="ghost-button"
                          style={{ fontSize: 12, color: "#dc2626", padding: 0, fontWeight: 600 }}
                          onClick={() => {
                            const next = !expandedCoAthletes[app.id];
                            setExpandedCoAthletes((prev) => ({ ...prev, [app.id]: next }));
                            if (next && !coAthletesByAppId[app.id]) {
                              loadCoAthletes(app.id, app.campaign_id);
                            }
                          }}
                        >
                          {expandedCoAthletes[app.id] ? "▲ Hide Fellow Athletes" : "▼ See Fellow Athletes"}
                        </button>

                        {expandedCoAthletes[app.id] && (
                          <div style={{ marginTop: 10 }}>
                            {loadingCoAthletes[app.id] ? (
                              <p style={{ fontSize: 12, color: "var(--muted)" }}>Loading…</p>
                            ) : !coAthletesByAppId[app.id] || coAthletesByAppId[app.id].length === 0 ? (
                              <p style={{ fontSize: 12, color: "var(--muted)" }}>No other athletes accepted yet.</p>
                            ) : (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                                {coAthletesByAppId[app.id].map((ca) => (
                                  <div
                                    key={ca.id}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 8,
                                      background: "#f9fafb",
                                      border: "1px solid #e5e7eb",
                                      borderRadius: 8,
                                      padding: "7px 10px",
                                      minWidth: 160,
                                    }}
                                  >
                                    <img
                                      src={
                                        ca.profile_photo_url ||
                                        `https://ui-avatars.com/api/?name=${encodeURIComponent(
                                          [ca.first_name, ca.last_name].filter(Boolean).join(" ") || "A"
                                        )}&background=ef233c&color=fff&size=80`
                                      }
                                      alt={[ca.first_name, ca.last_name].filter(Boolean).join(" ") || "Athlete"}
                                      style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                                    />
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontWeight: 600, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {[ca.first_name, ca.last_name].filter(Boolean).join(" ") || "Athlete"}
                                      </div>
                                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{ca.sport || ""}</div>
                                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{ca.school || ""}</div>
                                      <span
                                        style={{
                                          fontSize: 10,
                                          fontWeight: 700,
                                          padding: "1px 6px",
                                          borderRadius: 10,
                                          background:
                                            ca.tier === "Diamond" ? "#a855f7" :
                                            ca.tier === "Platinum" ? "#6b7280" :
                                            ca.tier === "Gold" ? "#d97706" :
                                            ca.tier === "Silver" ? "#9ca3af" :
                                            "#b45309",
                                          color: "#fff",
                                          display: "inline-block",
                                          marginTop: 2,
                                        }}
                                      >
                                        {ca.tier}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Leaderboard ── */}
        <section id="leaderboard" className="panel">
          <div className="panel-header">
            <h2>Global Athlete Leaderboard</h2>
            <button className="secondary-button" onClick={loadLeaderboard} disabled={leaderboardLoading} style={{ marginLeft: "auto" }}>
              {leaderboardLoading ? "Loading..." : "Refresh"}
            </button>
          </div>

          {leaderboardLoading && leaderboard.length === 0 ? (
            <p>Loading leaderboard…</p>
          ) : leaderboard.length === 0 ? (
            <p>No athletes on the leaderboard yet. Complete campaigns to earn XP and appear here.</p>
          ) : (
            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "center", width: 48 }}>Rank</th>
                    <th>Athlete</th>
                    <th>School</th>
                    <th>Sport</th>
                    <th>Tier</th>
                    <th style={{ textAlign: "right" }}>Total XP</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry) => {
                    const isMe = entry.athlete_id === currentUserId;
                    const fullName = [entry.first_name, entry.last_name].filter(Boolean).join(" ") || "Anonymous";
                    return (
                      <tr
                        key={entry.athlete_id}
                        style={{
                          background: isMe ? "rgba(220,38,38,0.08)" : undefined,
                          fontWeight: isMe ? 700 : undefined,
                        }}
                      >
                        <td style={{ textAlign: "center" }}>
                          {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : `#${entry.rank}`}
                        </td>
                        <td>{fullName}{isMe ? " (you)" : ""}</td>
                        <td>{entry.school || "-"}</td>
                        <td>{entry.sport || "-"}</td>
                        <td>{entry.tier}</td>
                        <td style={{ textAlign: "right" }}>{entry.total_xp.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {selectedCampaign && campaignModalId && (
          <div className="modal-overlay" onClick={() => setCampaignModalId(null)}>
            <div className="modal wide" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>{selectedCampaign.title} • Campaign Details</h3>
                <button className="ghost-button" onClick={() => setCampaignModalId(null)}>✕</button>
              </div>
              <div className="modal-body">
                <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 14, alignItems: "center" }}>
                  <img
                    src={`https://ui-avatars.com/api/?name=${encodeURIComponent(selectedBusiness?.business_name || "Business")}&background=111827&color=fff&size=160`}
                    alt={selectedBusiness?.business_name || "Business"}
                    style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover" }}
                  />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>{selectedBusiness?.business_name || "Business"}</div>
                    <div style={{ color: "#666", marginTop: 2 }}>
                      {CAMPAIGN_TYPE_LABELS[selectedCampaign.campaign_type] ?? selectedCampaign.campaign_type} • {selectedBusiness?.city || "-"}, {selectedBusiness?.state || "-"}
                    </div>
                  </div>
                </div>

                <div className="stats-grid three" style={{ marginTop: 14 }}>
                  <div className="stat-card">
                    <div className="stat-title">Payout</div>
                    <div className="stat-value" style={{ fontSize: 18 }}>${(selectedCampaign.payout_cents / 100).toFixed(0)}</div>
                    <div className="stat-subtext">per athlete</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-title">Tier Requirement</div>
                    <div className="stat-value" style={{ fontSize: 18 }}>{selectedCampaign.preferred_tier}</div>
                    <div className="stat-subtext">minimum athlete tier</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-title">Dates</div>
                    <div className="stat-value" style={{ fontSize: 18 }}>
                      {selectedCampaign.start_date || "-"} to {selectedCampaign.due_date || "-"}
                    </div>
                    <div className="stat-subtext">start to end</div>
                  </div>
                </div>

                <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                  <div><strong>Deliverables:</strong> {selectedCampaign.deliverables || "Not provided"}</div>
                  <div><strong>Additional compensation:</strong> {selectedCampaign.additional_compensation || "None listed"}</div>
                  <div><strong>Location:</strong> {selectedCampaign.location_text || [selectedBusiness?.city, selectedBusiness?.state].filter(Boolean).join(", ") || "Not provided"}</div>
                  <div><strong>Business:</strong> {selectedBusiness?.business_name || "Business"}</div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="secondary-button" onClick={() => setCampaignModalId(null)}>Close</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
