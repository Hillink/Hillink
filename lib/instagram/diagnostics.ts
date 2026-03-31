import { getXpReward } from "@/lib/xp";

export type InstagramConnection = {
  ig_user_id: string | null;
  access_token: string | null;
};

export type InstagramDiagnosticsSnapshot = {
  status: "verified" | "mock" | "missing_connection" | "unverified" | "error";
  source: "graph_api" | "mock";
  igMediaId: string | null;
  permalink: string;
  mediaType: string | null;
  caption: string | null;
  postedAt: string | null;
  likes: number;
  comments: number;
  saves: number;
  reach: number;
  impressions: number;
  videoViews: number;
  diagnosticsNotes: string | null;
};

export function isInstagramUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return host.includes("instagram.com");
  } catch {
    return false;
  }
}

export function normalizeInstagramPermalink(url: string) {
  const parsed = new URL(url);
  parsed.search = "";
  const cleaned = parsed.toString().replace(/\/$/, "");
  return cleaned;
}

function extractShortcode(permalink: string): string | null {
  const match = permalink.match(/\/(?:p|reel|tv)\/([^/?#]+)/i);
  return match?.[1] || null;
}

function asNumber(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

function calculateMockDiagnostics(permalink: string): InstagramDiagnosticsSnapshot {
  const seed = Array.from(permalink).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const likes = 40 + (seed % 260);
  const comments = 4 + (seed % 50);
  const saves = 3 + (seed % 35);
  const reach = 800 + (seed % 5000);
  const impressions = reach + (seed % 1200);
  const videoViews = 200 + (seed % 2500);

  return {
    status: "mock",
    source: "mock",
    igMediaId: null,
    permalink,
    mediaType: null,
    caption: null,
    postedAt: null,
    likes,
    comments,
    saves,
    reach,
    impressions,
    videoViews,
    diagnosticsNotes: "Mock diagnostics used because Instagram account is not connected.",
  };
}

async function fetchGraphJson<T>(url: string) {
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `Instagram API request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function fetchInstagramDiagnostics(params: {
  proofUrl: string;
  connection: InstagramConnection | null;
}): Promise<InstagramDiagnosticsSnapshot> {
  const permalink = normalizeInstagramPermalink(params.proofUrl);

  if (!params.connection?.ig_user_id || !params.connection?.access_token) {
    return {
      ...calculateMockDiagnostics(permalink),
      status: "missing_connection",
      diagnosticsNotes: "Instagram account not connected. Using mock diagnostics.",
    };
  }

  const shortcode = extractShortcode(permalink);
  if (!shortcode) {
    return {
      ...calculateMockDiagnostics(permalink),
      status: "unverified",
      diagnosticsNotes: "Could not parse Instagram shortcode from proof URL.",
    };
  }

  try {
    const token = encodeURIComponent(params.connection.access_token);
    const baseUrl = "https://graph.facebook.com/v21.0";
    const mediaListUrl = `${baseUrl}/${params.connection.ig_user_id}/media?fields=id,media_type,caption,timestamp,permalink,like_count,comments_count&limit=50&access_token=${token}`;

    const mediaList = await fetchGraphJson<{
      data?: Array<{
        id: string;
        media_type?: string;
        caption?: string;
        timestamp?: string;
        permalink?: string;
        like_count?: number;
        comments_count?: number;
      }>;
    }>(mediaListUrl);

    const match = (mediaList.data || []).find((item) => {
      if (!item.permalink) return false;
      const normalized = normalizeInstagramPermalink(item.permalink);
      return normalized === permalink || normalized.includes(`/${shortcode}`);
    });

    if (!match?.id) {
      return {
        ...calculateMockDiagnostics(permalink),
        status: "unverified",
        diagnosticsNotes: "Connected Instagram account could not verify this post URL.",
      };
    }

    const insightsUrl = `${baseUrl}/${match.id}/insights?metric=impressions,reach,saved,video_views&access_token=${token}`;
    const insights = await fetchGraphJson<{
      data?: Array<{ name: string; values?: Array<{ value?: number | string }> }>;
    }>(insightsUrl).catch(() => ({ data: [] }));

    const insightByName: Record<string, number> = {};
    for (const row of insights.data || []) {
      insightByName[row.name] = asNumber(row.values?.[0]?.value);
    }

    return {
      status: "verified",
      source: "graph_api",
      igMediaId: match.id,
      permalink,
      mediaType: match.media_type || null,
      caption: match.caption || null,
      postedAt: match.timestamp || null,
      likes: asNumber(match.like_count),
      comments: asNumber(match.comments_count),
      saves: asNumber(insightByName.saved),
      reach: asNumber(insightByName.reach),
      impressions: asNumber(insightByName.impressions),
      videoViews: asNumber(insightByName.video_views),
      diagnosticsNotes: null,
    };
  } catch (error) {
    return {
      ...calculateMockDiagnostics(permalink),
      status: "error",
      diagnosticsNotes: error instanceof Error ? error.message : "Instagram diagnostics fetch failed",
    };
  }
}

export function shouldAwardPerformanceBonus(snapshot: InstagramDiagnosticsSnapshot) {
  const engagement = snapshot.likes + snapshot.comments + snapshot.saves;
  const highReach = snapshot.reach >= 4000;
  const strongEngagement = engagement >= 180;
  const highVideoViews = snapshot.videoViews >= 3500;

  return highReach || strongEngagement || highVideoViews;
}

export function getPerformanceBonus() {
  return {
    action: "five_star_rating" as const,
    xp: getXpReward("five_star_rating"),
  };
}
