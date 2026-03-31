"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const dealOptions = [
  "Free meals or products",
  "Paid social media posts",
  "Local sponsorships",
  "Long-term ambassador deals",
];

export default function AthleteWaitlistForm() {
  const router = useRouter();

  const [form, setForm] = useState({
    school: "",
    sport: "",
    nil_experience: "",
    deal_types: [] as string[],
    would_use_platform: "",
    wants_early_access: "Yes, send me the link",
    email: "",
    instagram_handle: "",
    preferred_business_types: "",
    objections: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function updateField(name: string, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function toggleDealType(option: string) {
    setForm((prev) => ({
      ...prev,
      deal_types: prev.deal_types.includes(option)
        ? prev.deal_types.filter((item) => item !== option)
        : [...prev.deal_types, option],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const school = form.school.trim();
    const sport = form.sport.trim();
    const nilExperience = form.nil_experience.trim();
    const wouldUsePlatform = form.would_use_platform.trim();
    const email = form.email.trim().toLowerCase();

    if (
      !school ||
      !sport ||
      !nilExperience ||
      !wouldUsePlatform ||
      !email ||
      form.deal_types.length === 0
    ) {
      setError("Please complete all required fields.");
      return;
    }

    if (!isValidEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch("/api/waitlist/athlete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          school,
          sport,
          nil_experience: nilExperience,
          deal_types: form.deal_types,
          would_use_platform: wouldUsePlatform,
          wants_early_access: form.wants_early_access === "Yes, send me the link",
          email,
          instagram_handle: form.instagram_handle.trim(),
          preferred_business_types: form.preferred_business_types.trim(),
          objections: form.objections.trim(),
        }),
      });

      const data = (await response.json()) as { error?: string; duplicate?: boolean };

      if (!response.ok) {
        if (response.status === 409 || data.duplicate) {
          setError("That email is already on the athlete waitlist.");
          return;
        }
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }

      setSuccess("You are on the list. Redirecting...");
      setTimeout(() => {
        router.push("/waitlist/success");
      }, 500);
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
        <label htmlFor="school">What school do you play for?</label>
        <input
          id="school"
          type="text"
          value={form.school}
          onChange={(e) => updateField("school", e.target.value)}
          required
        />
      </div>

      <div className="waitlist-field">
        <label htmlFor="sport">What sport do you play?</label>
        <input
          id="sport"
          type="text"
          value={form.sport}
          onChange={(e) => updateField("sport", e.target.value)}
          required
        />
      </div>

      <div className="waitlist-field">
        <p className="waitlist-field-label">Have you done an NIL deal before?</p>
        <div className="waitlist-choice-list">
          {["Yes", "No", "Not yet, but I want to"].map((option) => (
            <label key={option} className="waitlist-choice-item">
              <input
                type="radio"
                name="nil_experience"
                value={option}
                checked={form.nil_experience === option}
                onChange={(e) => updateField("nil_experience", e.target.value)}
                required
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="waitlist-field">
        <p className="waitlist-field-label">What types of deals interest you most?</p>
        <div className="waitlist-choice-list">
          {dealOptions.map((option) => (
            <label key={option} className="waitlist-choice-item">
              <input
                type="checkbox"
                checked={form.deal_types.includes(option)}
                onChange={() => toggleDealType(option)}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="waitlist-field">
        <p className="waitlist-field-label">
          Would you use an easy platform that connects athletes with local brands?
        </p>
        <div className="waitlist-choice-list">
          {["Yes", "Maybe", "Probably not"].map((option) => (
            <label key={option} className="waitlist-choice-item">
              <input
                type="radio"
                name="would_use_platform"
                value={option}
                checked={form.would_use_platform === option}
                onChange={(e) => updateField("would_use_platform", e.target.value)}
                required
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
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
        <label htmlFor="athlete-email">Email</label>
        <input
          id="athlete-email"
          type="email"
          value={form.email}
          onChange={(e) => updateField("email", e.target.value)}
          required
        />
      </div>

      <div className="waitlist-field">
        <label htmlFor="instagram_handle">Instagram handle (optional)</label>
        <input
          id="instagram_handle"
          type="text"
          value={form.instagram_handle}
          onChange={(e) => updateField("instagram_handle", e.target.value)}
        />
      </div>

      <div className="waitlist-field">
        <label htmlFor="preferred_business_types">
          What kinds of local businesses would you want to work with? (optional)
        </label>
        <textarea
          id="preferred_business_types"
          value={form.preferred_business_types}
          onChange={(e) => updateField("preferred_business_types", e.target.value)}
        />
      </div>

      <div className="waitlist-field">
        <label htmlFor="athlete-objections">
          Anything that would make you not want to use a platform like this? (optional)
        </label>
        <textarea
          id="athlete-objections"
          value={form.objections}
          onChange={(e) => updateField("objections", e.target.value)}
        />
      </div>

      {error ? <p className="waitlist-error">{error}</p> : null}
      {success ? <p className="success-message">{success}</p> : null}

      <button type="submit" disabled={loading} className="waitlist-submit">
        {loading ? "Submitting..." : "Join Athlete Waitlist"}
      </button>
    </form>
  );
}
