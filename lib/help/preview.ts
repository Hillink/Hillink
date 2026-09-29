import type { HelpViewer } from "@/lib/help/server";

/** An admin's "preview as" choice from the URL. Always null for athletes and businesses. */
export function readPreviewAs(viewer: HelpViewer, value: string | string[] | undefined): "athlete" | "business" | null {
  if (viewer.role !== "admin") return null;
  return value === "athlete" || value === "business" ? value : null;
}
