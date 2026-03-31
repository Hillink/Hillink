"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BusinessWaitlistForm() {
  const router = useRouter();

  const [form, setForm] = useState({
    full_name: "",
    business_name: "",
    business_type: "",
    city: "",
    email: "",
    website_or_instagram: "",
    influencer_marketing_experience: "",
    desired_campaign_use: "",
    wants_early_access: "Yes, send me the link",
    budget_range: "",
    objections: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function normalize(value: string) {
    return value.trim();
  }

  function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function updateField(name: string, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (
      !normalize(form.full_name) ||
      !normalize(form.business_name) ||
      !normalize(form.business_type) ||
      !normalize(form.city) ||
      !normalize(form.email) ||
      !normalize(form.influencer_marketing_experience) ||
      !normalize(form.desired_campaign_use)
    ) {
      setError("Please complete all required fields.");
      return;
    }

    const normalizedEmail = normalize(form.email).toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch("/api/waitlist/business", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          full_name: normalize(form.full_name),
          business_name: normalize(form.business_name),
          business_type: normalize(form.business_type),
          city: normalize(form.city),
          email: normalizedEmail,
          website_or_instagram: normalize(form.website_or_instagram),
          influencer_marketing_experience: normalize(form.influencer_marketing_experience),
          desired_campaign_use: normalize(form.desired_campaign_use),
          wants_early_access: form.wants_early_access === "Yes, send me the link",
          budget_range: normalize(form.budget_range),
          objections: normalize(form.objections),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          duplicate?: boolean;
        };

        if (response.status === 409 || payload.duplicate) {
          setError("That email is already on the business waitlist.");
          return;
        }

        setError(payload.error || "Something went wrong. Please try again.");
        return;
      }

      router.push("/waitlist/success");
    } catch (submitError) {
      console.error(submitError);
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="waitlist-form">
      <div className="waitlist-field">
        <label htmlFor="full_name">Full name</label>
        <input
          id="full_name"
          type="text"
          value={form.full_name}
          onChange={(e) => updateField("full_name", e.target.value)}
          required
        />
      </div>

      <div className="waitlist-field">
        <label htmlFor="business_name">Business name</label>
        <input
          id="business_name"
          type="text"
          value={form.business_name}
          onChange={(e) => updateField("business_name", e.target.value)}
          required
        />
      </div>

      <div className="waitlist-field">
        <label htmlFor="business_type">Business type</label>
        <input
          id="business_type"
          type="text"
          value={form.business_type}
          onChange={(e) => updateField("business_type", e.target.value)}
          required
        />
      </div>

      <div className="waitlist-field">
        <label htmlFor="city">City</label>
        <input
          id="city"
          type="text"
          value={form.city}
          onChange={(e) => updateField("city", e.target.value)}
          required
        />
      </div>

      <div className="waitlist-field">
        <label htmlFor="business_email">Email</label>
        <input
          id="business_email"
          type="email"
          value={form.email}
          onChange={(e) => updateField("email", e.target.value)}
          required
        />
      </div>

      <div className="waitlist-field">
        <label htmlFor="website_or_instagram">Website or Instagram (optional)</label>
        <input
          id="website_or_instagram"
          type="text"
          value={form.website_or_instagram}
          onChange={(e) => updateField("website_or_instagram", e.target.value)}
        />
      </div>

      <div className="waitlist-field">
        <p className="waitlist-field-label">Have you used influencer marketing before?</p>
        <div className="waitlist-choice-list">
          {["Yes", "No", "Thinking about it"].map((option) => (
            <label key={option} className="waitlist-choice-item">
              <input
                type="radio"
                name="influencer_marketing_experience"
                value={option}
                checked={form.influencer_marketing_experience === option}
                onChange={(e) => updateField("influencer_marketing_experience", e.target.value)}
                required
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="waitlist-field">
        <label htmlFor="desired_campaign_use">What would you want athletes to help promote?</label>
        <textarea
          id="desired_campaign_use"
          value={form.desired_campaign_use}
          onChange={(e) => updateField("desired_campaign_use", e.target.value)}
          required
        />
      </div>

      <div className="waitlist-field">
        <p className="waitlist-field-label">Want early access when it launches?</p>
        <div className="waitlist-choice-list">
          {["Yes, send me the link", "No"].map((option) => (
            <label key={option} className="waitlist-choice-item">
              <input
                type="radio"
                name="wants_early_access"
                value={option}
                checked={form.wants_early_access === option}
                onChange={(e) => updateField("wants_early_access", e.target.value)}
                required
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="waitlist-field">
        <label htmlFor="budget_range">Monthly marketing budget range (optional)</label>
        <select
          id="budget_range"
          value={form.budget_range}
          onChange={(e) => updateField("budget_range", e.target.value)}
        >
          <option value="">Select one</option>
          <option value="Under $250">Under $250</option>
          <option value="$250-$500">$250-$500</option>
          <option value="$500-$1,000">$500-$1,000</option>
          <option value="$1,000+">$1,000+</option>
        </select>
      </div>

      <div className="waitlist-field">
        <label htmlFor="business-objections">
          Anything that would make you hesitate to use a platform like this? (optional)
        </label>
        <textarea
          id="business-objections"
          value={form.objections}
          onChange={(e) => updateField("objections", e.target.value)}
        />
      </div>

      {error ? <p className="waitlist-error">{error}</p> : null}

      <button type="submit" disabled={loading} className="waitlist-submit">
        {loading ? "Submitting..." : "Join Business Waitlist"}
      </button>
    </form>
  );
}
