"use client";

import { FormEvent, useState } from "react";

type TargetRole = "athlete" | "business" | "both";

type BroadcastResult = {
  sent: number;
  failed: number;
};

export default function BroadcastNotificationForm() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetRole, setTargetRole] = useState<TargetRole>("both");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = title.trim().length > 0 && body.trim().length > 0 && !loading;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/admin/notifications/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          targetRole,
        }),
      });

      const payload = (await response.json()) as unknown;

      if (!response.ok) {
        const errorMessage =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof (payload as { error?: unknown }).error === "string"
            ? (payload as { error: string }).error
            : "Failed to send notification";
        setError(errorMessage);
        return;
      }

      const successPayload = payload as BroadcastResult;
      setResult(successPayload);
      setTitle("");
      setBody("");
      setTargetRole("both");
    } catch {
      setError("Failed to send notification");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <label htmlFor="broadcast-title" className="mb-1 block text-sm font-semibold text-gray-800">
          Title
        </label>
        <input
          id="broadcast-title"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-red-500 focus:ring"
          placeholder="Notification title"
        />
      </div>

      <div className="mb-4">
        <label htmlFor="broadcast-body" className="mb-1 block text-sm font-semibold text-gray-800">
          Body
        </label>
        <textarea
          id="broadcast-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="min-h-28 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-red-500 focus:ring"
          placeholder="Write the message users will receive"
        />
      </div>

      <div className="mb-4">
        <label htmlFor="broadcast-role" className="mb-1 block text-sm font-semibold text-gray-800">
          Audience
        </label>
        <select
          id="broadcast-role"
          value={targetRole}
          onChange={(event) => setTargetRole(event.target.value as TargetRole)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-red-500 focus:ring"
        >
          <option value="athlete">Athletes only</option>
          <option value="business">Businesses only</option>
          <option value="both">Both</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Sending..." : "Send Notification"}
      </button>

      {result ? (
        <p className="mt-3 text-sm font-medium text-green-700">✓ Sent to {result.sent} users</p>
      ) : null}

      {error ? <p className="mt-3 text-sm font-medium text-red-700">{error}</p> : null}
    </form>
  );
}
