// How people reach a person when the Help Center can't answer. Today that's email; when Hillink has a
// ticket inbox or chat, change it here and every "Still need help?" link follows.

export const SUPPORT_EMAIL = "contact@hillink.io";

export function supportHref(options: { role?: string | null; articleSlug?: string | null; topic?: string | null } = {}): string {
  const subject = options.topic ? `Help: ${options.topic}` : "Help request";
  const lines = [
    "Tell us what you were trying to do and what happened:",
    "",
    "",
    "---",
    options.role ? `Account type: ${options.role}` : null,
    options.articleSlug ? `Help article: ${options.articleSlug}` : null,
  ].filter((line): line is string => line !== null);
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}
