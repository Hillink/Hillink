"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AthleteOnboardingPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    school: "",
    sport: "",
    graduation: "",
    city: "",
    state: "",
    instagram: "",
    tiktok: "",
    dealTypes: "",
    minimumPayout: "",
    travelRadius: "",
    preferredCompanyType: "",
    heardAbout: "",
    friendReferralCode: "",
    bio: "",
    recurringDeals: false,
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
      form.firstName,
      form.lastName,
      form.school,
      form.sport,
      form.city,
      form.state,
      form.bio,
    ];

    if (textValues.some((value) => selfReferencePattern.test(value))) {
      setError("ERR_SELF_REFERENCE_NOT_ALLOWED");
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
      first_name: form.firstName,
      last_name: form.lastName,
      school: form.school,
      sport: form.sport,
      graduation_year: form.graduation,
      city: form.city,
      state: form.state,
      instagram: form.instagram,
      tiktok: form.tiktok,
      deal_types: form.dealTypes,
      minimum_payout: form.minimumPayout,
      travel_radius: form.travelRadius,
      preferred_company_type: form.preferredCompanyType,
      heard_about: form.heardAbout,
      bio: form.bio,
      recurring_deals: form.recurringDeals,
      latitude: coords?.lat ?? null,
      longitude: coords?.lon ?? null,
    };

    let { error } = await supabase.from("athlete_profiles").upsert(payload);

    if (error && error.message.toLowerCase().includes("latitude")) {
      const { latitude: _latitude, longitude: _longitude, ...legacyPayload } = payload;
      const retry = await supabase.from("athlete_profiles").upsert(legacyPayload);
      error = retry.error;
    }

    if (!error) {
      await supabase
        .from("profiles")
        .update({ athlete_verification_status: "pending" })
        .eq("id", userId)
        .eq("role", "athlete");
    }

    setSaving(false);

    if (error) {
      setError(error.message);
    } else {
      router.push("/athlete/pending");
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
        <h1>Athlete Onboarding</h1>
        <p>Complete your profile to access the athlete portal.</p>

        {error && <div className="error-message">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-row two">
            <label>
              First name
              <input
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              />
            </label>
            <label>
              Last name
              <input
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              />
            </label>
          </div>

          <label>
            School
            <input
              value={form.school}
              onChange={(e) => setForm({ ...form, school: e.target.value })}
            />
          </label>

          <label>
            Sport
            <input
              value={form.sport}
              onChange={(e) => setForm({ ...form, sport: e.target.value })}
            />
          </label>

          <label>
            Graduation year
            <input
              value={form.graduation}
              onChange={(e) => setForm({ ...form, graduation: e.target.value })}
            />
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
            Instagram handle
            <input
              value={form.instagram}
              onChange={(e) => setForm({ ...form, instagram: e.target.value })}
            />
          </label>

          <label>
            TikTok handle
            <input
              value={form.tiktok}
              onChange={(e) => setForm({ ...form, tiktok: e.target.value })}
            />
          </label>

          <label>
            Preferred deal type
            <select
              value={form.dealTypes}
              onChange={(e) => setForm({ ...form, dealTypes: e.target.value })}
              required
            >
              <option value="">Select one</option>
              <option value="Instagram Post">Instagram Post</option>
              <option value="TikTok Post">TikTok Post</option>
              <option value="Story / Reel">Story / Reel</option>
              <option value="Event Appearance">Event Appearance</option>
              <option value="Product Promotion">Product Promotion</option>
              <option value="Brand Ambassador">Brand Ambassador</option>
              <option value="Local Business Promotion">Local Business Promotion</option>
            </select>
          </label>

          <label>
            Minimum payout
            <select
              value={form.minimumPayout}
              onChange={(e) => setForm({ ...form, minimumPayout: e.target.value })}
              required
            >
              <option value="">Select one</option>
              <option value="$25">$25</option>
              <option value="$50">$50</option>
              <option value="$100">$100</option>
              <option value="$200">$200</option>
              <option value="$500+">$500+</option>
            </select>
          </label>

          <label>
            Local radius
            <select
              value={form.travelRadius}
              onChange={(e) => setForm({ ...form, travelRadius: e.target.value })}
              required
            >
              <option value="">Select one</option>
              <option value="5 miles">5 miles</option>
              <option value="10 miles">10 miles</option>
              <option value="25 miles">25 miles</option>
              <option value="50 miles">50 miles</option>
              <option value="100 miles">100 miles</option>
              <option value="Remote Only">Remote Only</option>
            </select>
          </label>

          <label>
            Preferred company type
            <select
              value={form.preferredCompanyType}
              onChange={(e) => setForm({ ...form, preferredCompanyType: e.target.value })}
              required
            >
              <option value="">Select one</option>
              <option value="Fitness">Fitness</option>
              <option value="Food & Beverage">Food & Beverage</option>
              <option value="Apparel">Apparel</option>
              <option value="Wellness">Wellness</option>
              <option value="Retail">Retail</option>
              <option value="Tech">Tech</option>
              <option value="Automotive">Automotive</option>
              <option value="Hospitality">Hospitality</option>
              <option value="Entertainment">Entertainment</option>
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
              <option value="Campus event">Campus event</option>
              <option value="Coach / staff">Coach / staff</option>
              <option value="Search engine">Search engine</option>
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
            Short bio
            <textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
            />
          </label>

          <label>
            <input
              type="checkbox"
              checked={form.recurringDeals}
              onChange={(e) => setForm({ ...form, recurringDeals: e.target.checked })}
            />
            Recurring deals interest
          </label>

          <button className="cta-button full" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Complete Athlete Onboarding"}
          </button>
        </form>
      </div>
    </div>
  );
}
