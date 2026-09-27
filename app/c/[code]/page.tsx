import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeCode } from "@/lib/redemptions/codes";

export const dynamic = "force-dynamic";

// What a follower sees when they tap an athlete's link: the code to show at the counter.
export default async function CustomerCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = normalizeCode(decodeURIComponent(rawCode));

  let details: { businessName: string; offer: string | null; location: string | null; athlete: string | null } | null = null;
  if (code) {
    const admin = createAdminClient();
    const { data: promo } = await admin
      .from("athlete_promo_codes")
      .select("application_id, campaign_id, athlete_id, business_id, active")
      .eq("code", code)
      .maybeSingle();
    const { data: application } = promo
      ? await admin.from("campaign_applications").select("status").eq("id", promo.application_id).maybeSingle()
      : { data: null };
    const stillOn = !!application && ["accepted", "submitted", "approved", "completed"].includes(application.status);
    if (promo?.active && stillOn) {
      const [{ data: business }, { data: campaign }, { data: athlete }] = await Promise.all([
        admin.from("business_profiles").select("business_name, city, state").eq("id", promo.business_id).maybeSingle(),
        admin.from("campaigns").select("customer_offer, location_text").eq("id", promo.campaign_id).maybeSingle(),
        admin.from("athlete_profiles").select("first_name").eq("id", promo.athlete_id).maybeSingle(),
      ]);
      details = {
        businessName: business?.business_name || "this business",
        offer: campaign?.customer_offer || null,
        location: campaign?.location_text || [business?.city, business?.state].filter(Boolean).join(", ") || null,
        athlete: athlete?.first_name || null,
      };
    }
  }

  return (
    <main className="page-shell" style={{ display: "grid", placeItems: "center", padding: "32px 16px" }}>
      <div className="panel" style={{ width: "min(440px, 100%)", textAlign: "center" }}>
        {details ? (
          <>
            <p className="muted" style={{ margin: 0, fontWeight: 700 }}>
              {details.athlete ? `${details.athlete} sent you to` : "Show this at"}
            </p>
            <h1 style={{ margin: "6px 0 4px", fontSize: "1.8rem", letterSpacing: "-0.02em" }}>{details.businessName}</h1>
            {details.location && <p className="muted" style={{ margin: 0 }}>{details.location}</p>}
            {details.offer && (
              <p style={{ margin: "18px 0 0", fontSize: "1.15rem", fontWeight: 800, color: "var(--red)" }}>{details.offer}</p>
            )}
            <p className="muted" style={{ margin: "22px 0 8px", fontSize: "0.9rem" }}>Show or say this code when you pay</p>
            <div
              aria-label={`Code ${code}`}
              style={{
                fontSize: "clamp(2.2rem, 11vw, 3.2rem)",
                fontWeight: 900,
                letterSpacing: "0.08em",
                padding: "18px 12px",
                border: "2px dashed var(--border)",
                borderRadius: 16,
                background: "var(--surface-2)",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                wordBreak: "break-all",
              }}
            >
              {code}
            </div>
            <p className="muted" style={{ margin: "18px 0 0", fontSize: "0.8rem" }}>Powered by Hillink, local athletes for local businesses.</p>
          </>
        ) : (
          <>
            <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Code not found</h1>
            <p className="muted">This code has ended or doesn&apos;t exist. Ask the athlete who shared it for a new link.</p>
          </>
        )}
      </div>
    </main>
  );
}
