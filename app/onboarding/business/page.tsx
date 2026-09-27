"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BUSINESS_CATEGORIES, categoryByKey } from "@/lib/compliance/rules";

export default function BusinessOnboardingPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    businessName: "",
    contactFirstName: "",
    contactLastName: "",
    category: "",
    categoryKey: "",
    city: "",
    state: "",
    website: "",
    instagram: "",
    campaignInterests: "",
    budget: "",
    preferredTiers: "",
    localRadius: "",
    heardAbout: "",
    friendReferralCode: "",
    description: "",
  });

  useEffect(() => {
    const checkUser = async () => {
      const supabase = createClient();
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        router.push("/login");
        return;
      }
      setUserId(data.user.id);

      // Re-applying after a rejection: start from what they saved last time.
      const { data: existing } = await supabase
        .from("business_profiles")
        .select("*")
        .eq("id", data.user.id)
        .maybeSingle();
      if (existing) {
        const text = (value: unknown) => (typeof value === "string" ? value : "");
        const savedKey = text(existing.category_key);
        setForm((prev) => ({
          ...prev,
          businessName: text(existing.business_name),
          contactFirstName: text(existing.contact_first_name),
          contactLastName: text(existing.contact_last_name),
          categoryKey: categoryByKey(savedKey) ? savedKey : "",
          category: categoryByKey(savedKey)?.label || "",
          city: text(existing.city),
          state: text(existing.state),
          website: text(existing.website),
          instagram: text(existing.instagram),
          campaignInterests: text(existing.campaign_interests),
          budget: text(existing.budget),
          preferredTiers: text(existing.preferred_tiers),
          localRadius: text(existing.local_radius),
          heardAbout: text(existing.heard_about),
          description: text(existing.description),
        }));
      }
      setLoading(false);
    };

    checkUser();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    setError("");

    const selfReferencePattern = /\b(i|me|my|mine|myself|we|our|ours|ourselves)\b/i;
    const textValues = [
      form.businessName,
      form.contactFirstName,
      form.contactLastName,
      form.category,
      form.city,
      form.state,
      form.description,
    ];

    if (textValues.some((value) => selfReferencePattern.test(value))) {
      setError("ERR_SELF_REFERENCE_NOT_ALLOWED");
      return;
    }

    const chosenCategory = categoryByKey(form.categoryKey);
    if (!chosenCategory) {
      setError("Choose your business category.");
      return;
    }
    if (chosenCategory.restrictedReason) {
      setError(`Hillink can't run campaigns for this category. ${chosenCategory.restrictedReason}`);
      return;
    }

    setSaving(true);

    const supabase = createClient();
    const normalizedReferralCode = form.friendReferralCode.trim().toUpperCase();
    let coords: { lat: number; lon: number } | null = null;
    if (form.city.trim() && form.state.trim()) {
      const geoRes = await fetch("/api/location/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: form.city.trim(), state: form.state.trim() }),
      });
      if (geoRes.ok) {
        const geo = (await geoRes.json()) as { lat?: number | null; lon?: number | null };
        if (typeof geo.lat === "number" && typeof geo.lon === "number") {
          coords = { lat: geo.lat, lon: geo.lon };
        }
      }
    }

    if (normalizedReferralCode) {
      const { error: referralError } = await supabase
        .from("profiles")
        .update({ referred_by_code: normalizedReferralCode })
        .eq("id", userId)
        .is("referred_by_code", null);

      if (referralError) {
        setSaving(false);
        if (referralError.message.toLowerCase().includes("self referral")) {
          setError("ERR_SELF_REFERRAL_NOT_ALLOWED");
          return;
        }
        if (referralError.message.toLowerCase().includes("already set")) {
          setError("ERR_REFERRAL_ALREADY_SET");
          return;
        }
        if (referralError.message.toLowerCase().includes("invalid referral")) {
          setError("ERR_INVALID_REFERRAL_CODE");
          return;
        }

        setError(referralError.message);
        return;
      }
    }

    const payload = {
      id: userId,
      business_name: form.businessName,
      contact_first_name: form.contactFirstName,
      contact_last_name: form.contactLastName,
      category: chosenCategory.label,
      category_key: chosenCategory.key,
      city: form.city,
      state: form.state,
      latitude: coords?.lat ?? null,
      longitude: coords?.lon ?? null,
      website: form.website,
      instagram: form.instagram,
      campaign_interests: form.campaignInterests,
      budget: form.budget,
      preferred_tiers: form.preferredTiers,
      local_radius: form.localRadius,
      heard_about: form.heardAbout,
      description: form.description,
    };

    let { error } = await supabase.from("business_profiles").upsert(payload);

    // Databases without the compliance migration don't have category_key yet.
    if (error && error.message.toLowerCase().includes("category_key")) {
      const { category_key: _categoryKey, ...withoutKey } = payload;
      const retry = await supabase.from("business_profiles").upsert(withoutKey);
      error = retry.error;
    }

    if (error && error.message.toLowerCase().includes("latitude")) {
      const { latitude: _latitude, longitude: _longitude, ...legacyPayload } = payload;
      const retry = await supabase.from("business_profiles").upsert(legacyPayload);
      error = retry.error;
    }

    setSaving(false);

    if (error) {
      setError(error.message);
    } else {
      router.push("/business");
    }
  };

  if (loading) {
    return (
      <div className="auth-shell">
        <div className="auth-card">Loading user data...</div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>Business Onboarding</h1>
        <p>Complete your profile to access the business portal.</p>

        {error && <div className="error-message">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Business name
            <input
              value={form.businessName}
              onChange={(e) => setForm({ ...form, businessName: e.target.value })}
            />
          </label>

          <div className="form-row two">
            <label>
              Contact first name
              <input
                value={form.contactFirstName}
                onChange={(e) => setForm({ ...form, contactFirstName: e.target.value })}
              />
            </label>
            <label>
              Contact last name
              <input
                value={form.contactLastName}
                onChange={(e) => setForm({ ...form, contactLastName: e.target.value })}
              />
            </label>
          </div>

          <label>
            Business category
            <select
              value={form.categoryKey}
              onChange={(e) => setForm({ ...form, categoryKey: e.target.value, category: categoryByKey(e.target.value)?.label || "" })}
            >
              <option value="">Choose one</option>
              {BUSINESS_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}{c.restrictedReason ? " (not allowed on Hillink)" : ""}
                </option>
              ))}
            </select>
            {categoryByKey(form.categoryKey)?.restrictedReason && (
              <span style={{ color: "var(--red)", fontSize: 13 }}>{categoryByKey(form.categoryKey)?.restrictedReason}</span>
            )}
          </label>

          <div className="form-row two">
            <label>
              City
              <input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </label>
            <label>
              State
              <input
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
              />
            </label>
          </div>

          <label>
            Website
            <input
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
            />
          </label>

          <label>
            Instagram handle
            <input
              value={form.instagram}
              onChange={(e) => setForm({ ...form, instagram: e.target.value })}
            />
          </label>

          <label>
            Campaign goal
            <select
              value={form.campaignInterests}
              onChange={(e) => setForm({ ...form, campaignInterests: e.target.value })}
              required
            >
              <option value="">Select one</option>
              <option value="Brand Awareness">Brand Awareness</option>
              <option value="Foot Traffic">Foot Traffic</option>
              <option value="Product Promotion">Product Promotion</option>
              <option value="Event Promotion">Event Promotion</option>
              <option value="Social Growth">Social Growth</option>
              <option value="Long-Term Partnership">Long-Term Partnership</option>
            </select>
          </label>

          <label>
            Budget range
            <select
              value={form.budget}
              onChange={(e) => setForm({ ...form, budget: e.target.value })}
              required
            >
              <option value="">Select one</option>
              <option value="$100–$250">$100–$250</option>
              <option value="$250–$500">$250–$500</option>
              <option value="$500–$1,000">$500–$1,000</option>
              <option value="$1,000–$2,500">$1,000–$2,500</option>
              <option value="$2,500+">$2,500+</option>
            </select>
          </label>

          <label>
            Preferred athlete tier
            <select
              value={form.preferredTiers}
              onChange={(e) => setForm({ ...form, preferredTiers: e.target.value })}
              required
            >
              <option value="">Select one</option>
              <option value="Bronze">Bronze</option>
              <option value="Silver">Silver</option>
              <option value="Gold">Gold</option>
              <option value="Platinum">Platinum</option>
              <option value="No Preference">No Preference</option>
            </select>
          </label>

          <label>
            Local radius
            <select
              value={form.localRadius}
              onChange={(e) => setForm({ ...form, localRadius: e.target.value })}
              required
            >
              <option value="">Select one</option>
              <option value="5 miles">5 miles</option>
              <option value="10 miles">10 miles</option>
              <option value="25 miles">25 miles</option>
              <option value="50 miles">50 miles</option>
              <option value="100 miles">100 miles</option>
              <option value="Statewide">Statewide</option>
              <option value="Remote">Remote</option>
            </select>
          </label>

          <label>
            How did you hear about HILLink?
            <select
              value={form.heardAbout}
              onChange={(e) => setForm({ ...form, heardAbout: e.target.value })}
              required
            >
              <option value="">Select one</option>
              <option value="Instagram">Instagram</option>
              <option value="TikTok">TikTok</option>
              <option value="Friend referral">Friend referral</option>
              <option value="Local networking event">Local networking event</option>
              <option value="Search engine">Search engine</option>
              <option value="Email newsletter">Email newsletter</option>
              <option value="Other">Other</option>
            </select>
          </label>

          <label>
            Friend referral code (optional)
            <input
              value={form.friendReferralCode}
              onChange={(e) => setForm({ ...form, friendReferralCode: e.target.value.toUpperCase() })}
              placeholder="HL-ABCD-1234"
            />
          </label>

          <label>
            Company description
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>

          <button className="cta-button full" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Complete Business Onboarding"}
          </button>
        </form>
      </div>
    </div>
  );
}
