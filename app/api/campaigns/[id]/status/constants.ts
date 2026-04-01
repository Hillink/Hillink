export const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["active", "cancelled"],
  active: ["paused", "completed", "cancelled"],
  open: ["paused", "completed", "cancelled"],
  paused: ["active", "cancelled"],
  closed: ["active", "cancelled"],
  completed: [],
  cancelled: [],
};