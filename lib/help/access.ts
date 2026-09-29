// Who may read which Help Center articles. Pure, no imports, unit tested with `node --test`.
// The database enforces the same rule with row security (supabase/migrations/20260928000600_help_center.sql);
// the server applies it again on every query, so a mistake in one layer never exposes an article on its own.

export type HelpRole = "athlete" | "business" | "admin";
export type HelpAudience = "athlete" | "business" | "both" | "admin";
export type HelpStatus = "live" | "planned" | "experimental" | "deprecated" | "draft";

export const HELP_AUDIENCES: HelpAudience[] = ["athlete", "business", "both", "admin"];
export const HELP_STATUSES: HelpStatus[] = ["live", "planned", "experimental", "deprecated", "draft"];

/** What one signed-in reader may see. Only ever built from the server session (see lib/help/server.ts). */
export type HelpScope = {
  /** The role the content is shown for: the user's own role, or the role an admin is previewing as. */
  audienceRole: HelpRole;
  audiences: HelpAudience[];
  statuses: HelpStatus[];
};

export function isHelpRole(value: unknown): value is HelpRole {
  return value === "athlete" || value === "business" || value === "admin";
}

export function scopeForRole(role: HelpRole): HelpScope {
  if (role === "admin") {
    return { audienceRole: "admin", audiences: [...HELP_AUDIENCES], statuses: [...HELP_STATUSES] };
  }
  return { audienceRole: role, audiences: [role, "both"], statuses: ["live"] };
}

/**
 * The scope to query with. Admins may preview exactly what an athlete or business sees; anyone else's
 * request to preview is ignored, so a preview can only ever narrow access, never widen it.
 */
export function effectiveScope(role: HelpRole, previewAs?: string | null): HelpScope {
  if (role === "admin" && (previewAs === "athlete" || previewAs === "business")) {
    return scopeForRole(previewAs);
  }
  return scopeForRole(role);
}

export function canRead(scope: HelpScope, article: { audience: string; status: string }): boolean {
  return (
    (scope.audiences as string[]).includes(article.audience) && (scope.statuses as string[]).includes(article.status)
  );
}

/** Where to send someone after login when they arrived from a Help link. Only Help paths are allowed. */
export function safeHelpReturnPath(next: string | null | undefined): string | null {
  if (!next) return null;
  return /^\/help(\/[a-z0-9]+(-[a-z0-9]+)*){0,2}$/.test(next) ? next : null;
}
