// Checks an article coming from the admin editor. Pure, unit tested with `node --test`.
import { HELP_AUDIENCES, HELP_STATUSES, type HelpAudience, type HelpStatus } from "./access.ts";
import { HELP_CATEGORIES, RESERVED_HELP_SEGMENTS } from "./categories.ts";

export type HelpArticleInput = {
  slug: string;
  category: string;
  title: string;
  short_answer: string;
  body: string;
  steps: string[];
  audience: HelpAudience;
  status: HelpStatus;
  feature: string | null;
  keywords: string[];
  question_variants: string[];
  related_slugs: string[];
  featured: boolean;
  escalation_required: boolean;
  sort_order: number;
  last_verified_at: string | null;
};

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function cleanList(value: unknown, max: number, maxLength = 200): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split("\n") : [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim().slice(0, maxLength);
    if (trimmed && !out.includes(trimmed)) out.push(trimmed);
    if (out.length >= max) break;
  }
  return out;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function validateArticleInput(
  input: Record<string, unknown>
): { ok: true; value: HelpArticleInput } | { ok: false; error: string } {
  const str = (key: string) => (typeof input[key] === "string" ? (input[key] as string).trim() : "");

  const title = str("title");
  if (!title) return { ok: false, error: "Add a title." };
  if (title.length > 160) return { ok: false, error: "Keep the title under 160 characters." };

  const slug = str("slug") || slugify(title);
  if (!SLUG.test(slug) || slug.length > 80) {
    return { ok: false, error: "The URL name can only use lowercase letters, numbers and single dashes." };
  }

  const category = str("category");
  if (!HELP_CATEGORIES.some((c) => c.key === category) || RESERVED_HELP_SEGMENTS.includes(category)) {
    return { ok: false, error: "Choose a category from the list." };
  }

  const audience = str("audience") as HelpAudience;
  if (!HELP_AUDIENCES.includes(audience)) return { ok: false, error: "Choose who can read this article." };

  const status = (str("status") || "draft") as HelpStatus;
  if (!HELP_STATUSES.includes(status)) return { ok: false, error: "Choose a status." };

  // Internal notes must never be published to customers by picking the wrong category.
  if (category === "internal" && audience !== "admin") {
    return { ok: false, error: "Articles in Internal must have the audience Admins only." };
  }

  const shortAnswer = str("short_answer");
  const body = typeof input.body === "string" ? input.body.replace(/\r\n/g, "\n").trim() : "";
  if (status === "live" && !shortAnswer) return { ok: false, error: "A live article needs a short answer." };
  if (shortAnswer.length > 600) return { ok: false, error: "Keep the short answer under 600 characters." };
  if (body.length > 20000) return { ok: false, error: "The article body is too long." };

  const sortOrder = Number(input.sort_order ?? 100);
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10000) {
    return { ok: false, error: "Sort order must be a whole number from 0 to 10000." };
  }

  const verified = str("last_verified_at");
  if (verified && !Number.isFinite(Date.parse(verified))) return { ok: false, error: "Last verified must be a date." };

  const related = cleanList(input.related_slugs, 10, 80).filter((s) => SLUG.test(s) && s !== slug);

  return {
    ok: true,
    value: {
      slug,
      category,
      title,
      short_answer: shortAnswer,
      body,
      steps: cleanList(input.steps, 20, 400),
      audience,
      status,
      feature: str("feature") || null,
      keywords: cleanList(input.keywords, 30, 60),
      question_variants: cleanList(input.question_variants, 20, 200),
      related_slugs: related,
      featured: input.featured === true,
      escalation_required: input.escalation_required === true,
      sort_order: sortOrder,
      last_verified_at: verified ? new Date(verified).toISOString() : null,
    },
  };
}
