"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { generateReferralCode } from "@/lib/referrals";

type ProfileResult = {
  role?: "athlete" | "business";
  referral_code?: string | null;
  referred_by_code?: string | null;
};

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingEmail, setChangingEmail] = useState(false);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const [startingOnboarding, setStartingOnboarding] = useState(false);
  const [terminatingAccount, setTerminatingAccount] = useState(false);
  const [connectingInstagram, setConnectingInstagram] = useState(false);
  const [billingDebug, setBillingDebug] = useState("");
  const [role, setRole] = useState<"athlete" | "business" | null>(null);
  const [accountEmail, setAccountEmail] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [referredByCode, setReferredByCode] = useState("");
  const [referralInput, setReferralInput] = useState("");
  const [savingReferral, setSavingReferral] = useState(false);
  const [copied, setCopied] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [athleteSettings, setAthleteSettings] = useState({
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
    bio: "",
    recurringDeals: false,
  });

  const [businessSettings, setBusinessSettings] = useState({
    businessName: "",
    contactFirstName: "",
    contactLastName: "",
    instagram: "",
    website: "",
    category: "",
    city: "",
    state: "",
    description: "",
    campaignInterests: "",
    budgetRange: "",
    localRadius: "",
    preferredAthleteTier: "",
    heardAbout: "",
  });

  const [businessBilling, setBusinessBilling] = useState({
    subscriptionTier: "starter" as "starter" | "growth" | "scale" | "domination",
    billingName: "",
    billingEmail: "",
    billingAddressLine1: "",
    billingCity: "",
    billingState: "",
    billingPostalCode: "",
    billingCountry: "US",
    cardBrand: "",
    cardLast4: "",
    billingReady: false,
  });

  const [athletePayout, setAthletePayout] = useState({
    payoutMethod: "stripe_connect" as "stripe_connect" | "bank_transfer" | "paypal" | "venmo" | "cashapp",
    recipientName: "",
    recipientEmail: "",
    payoutHandle: "",
    bankLast4: "",
    payoutReady: false,
  });

  const [instagramConnection, setInstagramConnection] = useState({
    igUserId: "",
    igUsername: "",
    accessToken: "",
    connected: false,
  });

  useEffect(() => {
    const loadSettings = async () => {
      const supabase = createClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData.user) {
        router.push("/login");
        return;
      }

      const userId = userData.user.id;
      setAccountEmail(userData.user.email || "");
      setNewEmail(userData.user.email || "");
      setUserId(userId);
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("role, referral_code, referred_by_code")
        .eq("id", userId)
        .single();

      if (profileError || !profileData) {
        router.push("/role-redirect");
        return;
      }

      const profile = profileData as ProfileResult;
      const generatedCode = generateReferralCode(userId);
      const existingCode = profile.referral_code?.trim();
      const finalCode = existingCode || generatedCode;

      setRole(profile.role || null);
      setReferralCode(finalCode);
      setReferredByCode(profile.referred_by_code?.trim() || "");

      if (profile.role === "athlete") {
        const { data: athleteData } = await supabase
          .from("athlete_profiles")
          .select("first_name, last_name, school, sport, graduation, city, state, instagram, tiktok, deal_types, minimum_payout, travel_radius, preferred_company_type, heard_about, bio, recurring_deals, profile_photo_url")
          .eq("id", userId)
          .single();

        if (athleteData) {
          setAthleteSettings({
            firstName: athleteData.first_name || "",
            lastName: athleteData.last_name || "",
            school: athleteData.school || "",
            sport: athleteData.sport || "",
            graduation: athleteData.graduation || "",
            city: athleteData.city || "",
            state: athleteData.state || "",
            instagram: athleteData.instagram || "",
            tiktok: athleteData.tiktok || "",
            dealTypes: athleteData.deal_types || "",
            minimumPayout: athleteData.minimum_payout || "",
            travelRadius: athleteData.travel_radius || "",
            preferredCompanyType: athleteData.preferred_company_type || "",
            heardAbout: athleteData.heard_about || "",
            bio: athleteData.bio || "",
            recurringDeals: !!athleteData.recurring_deals,
          });
          setProfilePhotoUrl(athleteData.profile_photo_url || "");
        }

        const { data: payoutData } = await supabase
          .from("athlete_payout_profiles")
          .select("payout_method, recipient_name, recipient_email, payout_handle, bank_last4, payout_ready")
          .eq("athlete_id", userId)
          .single();

        if (payoutData) {
          setAthletePayout({
            payoutMethod: payoutData.payout_method || "stripe_connect",
            recipientName: payoutData.recipient_name || "",
            recipientEmail: payoutData.recipient_email || "",
            payoutHandle: payoutData.payout_handle || "",
            bankLast4: payoutData.bank_last4 || "",
            payoutReady: !!payoutData.payout_ready,
          });
        }

        const { data: igData } = await supabase
          .from("athlete_instagram_connections")
          .select("ig_user_id, ig_username, access_token")
          .eq("athlete_id", userId)
          .single();

        if (igData) {
          setInstagramConnection({
            igUserId: igData.ig_user_id || "",
            igUsername: igData.ig_username || "",
            accessToken: igData.access_token || "",
            connected: !!igData.access_token,
          });
        }
      }

      if (profile.role === "business") {
        const { data: businessData } = await supabase
          .from("business_profiles")
          .select("business_name, contact_first_name, contact_last_name, instagram, website, category, city, state, description, campaign_interests, budget, local_radius, preferred_tiers, heard_about")
          .eq("id", userId)
          .single();

        if (businessData) {
          setBusinessSettings({
            businessName: businessData.business_name || "",
            contactFirstName: businessData.contact_first_name || "",
            contactLastName: businessData.contact_last_name || "",
            instagram: businessData.instagram || "",
            website: businessData.website || "",
            category: businessData.category || "",
            city: businessData.city || "",
            state: businessData.state || "",
            description: businessData.description || "",
            campaignInterests: businessData.campaign_interests || "",
            budgetRange: businessData.budget || "",
            localRadius: businessData.local_radius || "",
            preferredAthleteTier: businessData.preferred_tiers || "",
            heardAbout: businessData.heard_about || "",
          });
        }

        const { data: billingData } = await supabase
          .from("business_billing_profiles")
          .select("subscription_tier, billing_name, billing_email, billing_address_line1, billing_city, billing_state, billing_postal_code, billing_country, card_brand, card_last4, billing_ready")
          .eq("business_id", userId)
          .single();

        if (billingData) {
          setBusinessBilling({
            subscriptionTier: billingData.subscription_tier || "starter",
            billingName: billingData.billing_name || "",
            billingEmail: billingData.billing_email || "",
            billingAddressLine1: billingData.billing_address_line1 || "",
            billingCity: billingData.billing_city || "",
            billingState: billingData.billing_state || "",
            billingPostalCode: billingData.billing_postal_code || "",
            billingCountry: billingData.billing_country || "US",
            cardBrand: billingData.card_brand || "",
            cardLast4: billingData.card_last4 || "",
            billingReady: !!billingData.billing_ready,
          });
        }
      }

      if (!existingCode) {
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ referral_code: finalCode })
          .eq("id", userId);

        if (updateError && updateError.message.includes("referral_code")) {
          setWarning(
            "Referral code column missing in profiles table. Run: alter table public.profiles add column referral_code text unique;"
          );
        } else if (updateError) {
          setWarning("Unable to persist referral code right now.");
        }
      }

      setLoading(false);
    };

    loadSettings();
  }, [router]);

  useEffect(() => {
    const instagramStatus = searchParams.get("instagram");
    const instagramMessage = searchParams.get("instagram_message");

    if (instagramStatus === "connected") {
      setError("");
      setSuccessMessage("Instagram connected via Meta OAuth.");
      setInstagramConnection((prev) => ({ ...prev, connected: true }));
      return;
    }

    if (instagramStatus === "error") {
      setSuccessMessage("");
      setError(instagramMessage || "Instagram OAuth failed.");
    }
  }, [searchParams]);

  const handleSaveProfileSettings = async () => {
    if (!userId || !role) return;

    setError("");
    setWarning("");
    setSuccessMessage("");
    setSavingProfile(true);
    const supabase = createClient();

    if (role === "athlete") {
      if (!athleteSettings.firstName.trim() || !athleteSettings.lastName.trim()) {
        setSavingProfile(false);
        setError("First name and last name are required.");
        return;
      }

      const { error: saveError } = await supabase.from("athlete_profiles").upsert(
        {
          id: userId,
          first_name: athleteSettings.firstName.trim(),
          last_name: athleteSettings.lastName.trim(),
          school: athleteSettings.school.trim() || null,
          sport: athleteSettings.sport.trim() || null,
          graduation: athleteSettings.graduation.trim() || null,
          city: athleteSettings.city.trim() || null,
          state: athleteSettings.state.trim() || null,
          instagram: athleteSettings.instagram.trim() || null,
          tiktok: athleteSettings.tiktok.trim() || null,
          deal_types: athleteSettings.dealTypes.trim() || null,
          minimum_payout: athleteSettings.minimumPayout.trim() || null,
          travel_radius: athleteSettings.travelRadius.trim() || null,
          preferred_company_type: athleteSettings.preferredCompanyType.trim() || null,
          heard_about: athleteSettings.heardAbout.trim() || null,
          bio: athleteSettings.bio.trim() || null,
          recurring_deals: athleteSettings.recurringDeals,
          profile_photo_url: profilePhotoUrl || null,
        },
        { onConflict: "id" }
      );

      if (saveError) {
        setSavingProfile(false);
        setError(saveError.message);
        return;
      }

      const payoutReady =
        !!athletePayout.recipientName.trim() &&
        (athletePayout.payoutMethod === "stripe_connect" || !!athletePayout.recipientEmail.trim() || !!athletePayout.payoutHandle.trim());

      const { error: payoutError } = await supabase.from("athlete_payout_profiles").upsert(
        {
          athlete_id: userId,
          payout_method: athletePayout.payoutMethod,
          recipient_name: athletePayout.recipientName.trim() || "",
          recipient_email: athletePayout.recipientEmail.trim() || null,
          payout_handle: athletePayout.payoutHandle.trim() || null,
          bank_last4: athletePayout.bankLast4.trim() || null,
          payout_ready: payoutReady,
        },
        { onConflict: "athlete_id" }
      );

      if (payoutError) {
        setSavingProfile(false);
        setError(payoutError.message);
        return;
      }
    }

    if (role === "business") {
      if (!businessSettings.businessName.trim()) {
        setSavingProfile(false);
        setError("Business name is required.");
        return;
      }

      const { error: saveError } = await supabase.from("business_profiles").upsert(
        {
          id: userId,
          business_name: businessSettings.businessName.trim(),
          contact_first_name: businessSettings.contactFirstName.trim() || null,
          contact_last_name: businessSettings.contactLastName.trim() || null,
          instagram: businessSettings.instagram.trim() || null,
          website: businessSettings.website.trim() || null,
          category: businessSettings.category.trim() || null,
          city: businessSettings.city.trim() || null,
          state: businessSettings.state.trim() || null,
          description: businessSettings.description.trim() || null,
          campaign_interests: businessSettings.campaignInterests.trim() || null,
          budget: businessSettings.budgetRange || null,
          local_radius: businessSettings.localRadius || null,
          preferred_tiers: businessSettings.preferredAthleteTier || null,
          heard_about: businessSettings.heardAbout.trim() || null,
        },
        { onConflict: "id" }
      );

      if (saveError) {
        setSavingProfile(false);
        setError(saveError.message);
        return;
      }

      const { error: billingError } = await supabase.from("business_billing_profiles").upsert(
        {
          business_id: userId,
          billing_name: businessBilling.billingName.trim() || "",
          billing_email: businessBilling.billingEmail.trim() || "",
          billing_address_line1: businessBilling.billingAddressLine1.trim() || "",
          billing_city: businessBilling.billingCity.trim() || "",
          billing_state: businessBilling.billingState.trim() || "",
          billing_postal_code: businessBilling.billingPostalCode.trim() || "",
          billing_country: businessBilling.billingCountry.trim() || "US",
          card_brand: businessBilling.cardBrand.trim() || null,
          card_last4: businessBilling.cardLast4.trim() || null,
        },
        { onConflict: "business_id" }
      );

      if (billingError) {
        setSavingProfile(false);
        setError(billingError.message);
        return;
      }
    }

    setSavingProfile(false);
    setSuccessMessage("Settings saved.");
  };

  const handlePhotoUpload = async (file: File) => {
    if (!userId) return;
    setUploadingPhoto(true);
    setError("");
    const supabase = createClient();
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${userId}/avatar.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("profile-photos")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) {
      setUploadingPhoto(false);
      setError(uploadError.message);
      return;
    }
    const { data: urlData } = supabase.storage
      .from("profile-photos")
      .getPublicUrl(path);
    const url = urlData.publicUrl;
    setProfilePhotoUrl(url);
    // Persist immediately
    await supabase
      .from("athlete_profiles")
      .upsert({ id: userId, profile_photo_url: url }, { onConflict: "id" });
    setUploadingPhoto(false);
    setLastSavedAt(new Date().toLocaleTimeString());
    setSuccessMessage("Photo uploaded.");
  };

  const handleChangeEmail = async () => {
    if (!newEmail.trim() || !newEmail.includes("@")) {
    setLastSavedAt(new Date().toLocaleTimeString());
      setError("Please enter a valid email.");
      return;
    }

    setError("");
    setSuccessMessage("");
    setChangingEmail(true);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ email: newEmail.trim() });

    setChangingEmail(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccessMessage("Email change requested. Check your inbox to confirm the new address before using it for athlete role selection.");
  };

  const handleStartBusinessCheckout = async () => {
    if (role !== "business") return;
    setError("");
    setSuccessMessage("");
    setBillingDebug("");
    setStartingCheckout(true);

    const res = await fetch("/api/stripe/create-subscription-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: businessBilling.subscriptionTier }),
    });
    const data = await res.json();
    setStartingCheckout(false);

    setBillingDebug(JSON.stringify({ status: res.status, ok: res.ok, data }, null, 2));

    if (res.ok && data.manualActivated) {
      setBusinessBilling((prev) => ({ ...prev, billingReady: true }));
      setSuccessMessage("Billing activated in development mode (Stripe fallback). You can continue testing now.");
      return;
    }

    if (res.ok && data.alreadyActive) {
      setSuccessMessage("This tier is already active.");
      return;
    }

    if (res.ok && data.updated) {
      setBusinessBilling((prev) => ({
        ...prev,
        subscriptionTier: businessBilling.subscriptionTier,
        billingReady: true,
      }));
      setSuccessMessage("Subscription updated. Stripe will immediately bill or credit the prorated difference.");
      return;
    }

    if (res.status === 409 && data?.code === "existing_subscription_detected") {
      setError(
        "We found your existing subscription and blocked a duplicate checkout to protect you from double charges. Please refresh and try upgrading again."
      );
      return;
    }

    if (!res.ok || !data.url) {
      setError(data.error || "Failed to start Stripe checkout");
      return;
    }

    window.location.href = data.url;
  };

  const handleStartAthleteOnboarding = async () => {
    if (role !== "athlete") return;
    setError("");
    setSuccessMessage("");
    setStartingOnboarding(true);

    const res = await fetch("/api/stripe/create-connect-onboarding", {
      method: "POST",
    });
    const data = await res.json();
    setStartingOnboarding(false);

    if (res.ok && data.manualActivated) {
      setAthletePayout((prev) => ({ ...prev, payoutReady: true }));
      setSuccessMessage("Payout account activated in development mode (Stripe fallback). You can continue testing now.");
      return;
    }

    if (!res.ok || !data.url) {
      setError(data.error || "Failed to start Stripe Connect onboarding");
      return;
    }

    window.location.href = data.url;
  };

  const handleSaveInstagramConnection = async () => {
    if (role !== "athlete") return;
    if (!instagramConnection.accessToken.trim()) {
      setError("Instagram access token is required.");
      return;
    }

    setError("");
    setSuccessMessage("");
    setConnectingInstagram(true);

    const res = await fetch("/api/instagram/connect-manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        igUserId: instagramConnection.igUserId.trim() || null,
        igUsername: instagramConnection.igUsername.trim() || null,
        accessToken: instagramConnection.accessToken.trim(),
      }),
    });

    const data = await res.json();
    setConnectingInstagram(false);

    if (!res.ok) {
      setError(data.error || "Failed to connect Instagram.");
      return;
    }

    setInstagramConnection((prev) => ({ ...prev, connected: true }));
    setSuccessMessage("Instagram diagnostics connection saved.");
  };

  const handleStartInstagramOAuth = () => {
    setError("");
    setSuccessMessage("");
    window.location.href = "/api/instagram/oauth/start";
  };

  const handleTerminateAccount = async () => {
    if (role !== "athlete" && role !== "business") {
      return;
    }

    const confirmed = window.confirm("are you sure you wish to terminate your account?");
    if (!confirmed) {
      return;
    }

    const typed = window.prompt('Type "TERMINATE" to confirm account termination.');
    if ((typed || "").trim().toUpperCase() !== "TERMINATE") {
      setError('Account termination cancelled. You must type "TERMINATE" exactly.');
      return;
    }

    setError("");
    setWarning("");
    setSuccessMessage("");
    setTerminatingAccount(true);

    const res = await fetch("/api/account/terminate", {
      method: "POST",
    });

    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      data = {};
    }

    setTerminatingAccount(false);

    if (!res.ok) {
      setError(String(data.error || "Failed to terminate account."));
      return;
    }

    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  };

  const handleApplyReferral = async () => {
    if (!userId || !referralCode) return;

    const normalizedInput = referralInput.trim().toUpperCase();
    if (!normalizedInput) {
      setError("Please enter a referral code.");
      return;
    }

    if (normalizedInput === referralCode.toUpperCase()) {
      setError("ERR_SELF_REFERRAL_NOT_ALLOWED");
      return;
    }

    if (referredByCode) {
      setError("ERR_REFERRAL_ALREADY_SET");
      return;
    }

    setError("");
    setSavingReferral(true);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ referred_by_code: normalizedInput })
      .eq("id", userId)
      .is("referred_by_code", null);

    setSavingReferral(false);

    if (updateError) {
      if (updateError.message.toLowerCase().includes("self referral")) {
        setError("ERR_SELF_REFERRAL_NOT_ALLOWED");
        return;
      }
      if (updateError.message.toLowerCase().includes("already set")) {
        setError("ERR_REFERRAL_ALREADY_SET");
        return;
      }
      if (updateError.message.toLowerCase().includes("invalid referral")) {
        setError("ERR_INVALID_REFERRAL_CODE");
        return;
      }
      setError(updateError.message);
      return;
    }

    setReferredByCode(normalizedInput);
    setReferralInput("");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Copy failed. Please copy the code manually.");
    }
  };

  if (loading) {
    return (
      <div className="auth-shell">
        <div className="auth-card">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>Settings</h1>
        <p>Manage your account and referral details.</p>

        {error && <div className="error-message">{error}</div>}
        {warning && <div className="error-message">{warning}</div>}
        {successMessage && <div className="success-message">{successMessage}</div>}
        {billingDebug && (
          <pre
            style={{
              marginTop: 12,
              padding: 12,
              background: "#f3f4f6",
              borderRadius: 8,
              overflowX: "auto",
              fontSize: 12,
              whiteSpace: "pre-wrap",
            }}
          >
            {billingDebug}
          </pre>
        )}

        {role === "athlete" && (
          <>
            {/* Profile Photo */}
            <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 16, marginBottom: 8 }}>
              <div style={{ position: "relative", width: 96, height: 96, flexShrink: 0 }}>
                <img
                  src={
                    profilePhotoUrl ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(
                      [athleteSettings.instagram].filter(Boolean).join(" ") || "Athlete"
                    )}&background=ef233c&color=fff&size=192`
                  }
                  alt="Profile photo"
                  style={{ width: 96, height: 96, borderRadius: "50%", objectFit: "cover", border: "2px solid #e5e7eb" }}
                />
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Profile Photo</div>
                <label
                  style={{
                    display: "inline-block",
                    padding: "6px 14px",
                    background: "#f3f4f6",
                    border: "1px solid #d1d5db",
                    borderRadius: 6,
                    cursor: uploadingPhoto ? "not-allowed" : "pointer",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  {uploadingPhoto ? "Uploading…" : profilePhotoUrl ? "Change Photo" : "Upload Photo"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: "none" }}
                    disabled={uploadingPhoto}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handlePhotoUpload(f);
                    }}
                  />
                </label>
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>JPG, PNG or WebP · max 5 MB</div>
              </div>
            </div>

            <h2 style={{ marginTop: 24 }}>Athlete Profile</h2>
            <p style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
              This information appears on your athlete profile for businesses and other athletes in active campaigns.
            </p>
            <div className="form-grid two" style={{ marginTop: 12 }}>
              <label>
                First name
                <input
                  value={athleteSettings.firstName}
                  onChange={(e) =>
                    setAthleteSettings({ ...athleteSettings, firstName: e.target.value })
                  }
                  required
                />
              </label>
              <label>
                Last name
                <input
                  value={athleteSettings.lastName}
                  onChange={(e) =>
                    setAthleteSettings({ ...athleteSettings, lastName: e.target.value })
                  }
                  required
                />
              </label>
              <label>
                School
                <input
                  value={athleteSettings.school}
                  onChange={(e) =>
                    setAthleteSettings({ ...athleteSettings, school: e.target.value })
                  }
                />
              </label>
              <label>
                Sport
                <input
                  value={athleteSettings.sport}
                  onChange={(e) =>
                    setAthleteSettings({ ...athleteSettings, sport: e.target.value })
                  }
                />
              </label>
              <label>
                Graduation year
                <input
                  value={athleteSettings.graduation}
                  onChange={(e) =>
                    setAthleteSettings({ ...athleteSettings, graduation: e.target.value })
                  }
                  placeholder="2027"
                />
              </label>
              <label>
                Minimum payout
                <input
                  value={athleteSettings.minimumPayout}
                  onChange={(e) =>
                    setAthleteSettings({ ...athleteSettings, minimumPayout: e.target.value })
                  }
                  placeholder="250"
                />
              </label>
              <label>
                City
                <input
                  value={athleteSettings.city}
                  onChange={(e) =>
                    setAthleteSettings({ ...athleteSettings, city: e.target.value })
                  }
                />
              </label>
              <label>
                State
                <input
                  value={athleteSettings.state}
                  onChange={(e) =>
                    setAthleteSettings({ ...athleteSettings, state: e.target.value })
                  }
                />
              </label>
              <label>
                Deal preferences
                <input
                  value={athleteSettings.dealTypes}
                  onChange={(e) =>
                    setAthleteSettings({ ...athleteSettings, dealTypes: e.target.value })
                  }
                  placeholder="Instagram posts, appearances, brand ambassador"
                />
              </label>
              <label>
                Preferred company type
                <input
                  value={athleteSettings.preferredCompanyType}
                  onChange={(e) =>
                    setAthleteSettings({ ...athleteSettings, preferredCompanyType: e.target.value })
                  }
                  placeholder="Local business, fitness, apparel"
                />
              </label>
              <label>
                Travel radius
                <input
                  value={athleteSettings.travelRadius}
                  onChange={(e) =>
                    setAthleteSettings({ ...athleteSettings, travelRadius: e.target.value })
                  }
                  placeholder="25 miles"
                />
              </label>
              <label>
                How did you hear about HILLink?
                <input
                  value={athleteSettings.heardAbout}
                  onChange={(e) =>
                    setAthleteSettings({ ...athleteSettings, heardAbout: e.target.value })
                  }
                />
              </label>
            </div>

            <label style={{ display: "block", marginTop: 12 }}>
              Bio
              <textarea
                value={athleteSettings.bio}
                onChange={(e) =>
                  setAthleteSettings({ ...athleteSettings, bio: e.target.value })
                }
                rows={4}
                placeholder="Tell brands and businesses who you are, what audience you reach, and what kinds of campaigns you want."
              />
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={athleteSettings.recurringDeals}
                onChange={(e) =>
                  setAthleteSettings({ ...athleteSettings, recurringDeals: e.target.checked })
                }
              />
              Open to recurring brand deals
            </label>

            <div className="form-grid" style={{ marginTop: 16 }}>
              <label>
                Instagram handle
                <input
                  value={athleteSettings.instagram}
                  onChange={(e) =>
                    setAthleteSettings({ ...athleteSettings, instagram: e.target.value })
                  }
                  required
                />
              </label>
              <label>
                TikTok handle (optional)
                <input
                  value={athleteSettings.tiktok}
                  onChange={(e) =>
                    setAthleteSettings({ ...athleteSettings, tiktok: e.target.value })
                  }
                />
              </label>
            </div>

            <h2 style={{ marginTop: 24 }}>Payout Receiving Information</h2>
            <div className="form-grid" style={{ marginTop: 12 }}>
              <label>
                Payout method
                <select
                  value={athletePayout.payoutMethod}
                  onChange={(e) =>
                    setAthletePayout({
                      ...athletePayout,
                      payoutMethod: e.target.value as "stripe_connect" | "bank_transfer" | "paypal" | "venmo" | "cashapp",
                    })
                  }
                >
                  <option value="stripe_connect">Stripe Connect (recommended)</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="paypal">PayPal</option>
                  <option value="venmo">Venmo</option>
                  <option value="cashapp">Cash App</option>
                </select>
              </label>
              <label>
                Recipient full name
                <input
                  value={athletePayout.recipientName}
                  onChange={(e) => setAthletePayout({ ...athletePayout, recipientName: e.target.value })}
                />
              </label>
              <label>
                Recipient email
                <input
                  value={athletePayout.recipientEmail}
                  onChange={(e) => setAthletePayout({ ...athletePayout, recipientEmail: e.target.value })}
                  placeholder="For Stripe/PayPal"
                />
              </label>
              <label>
                Handle / username
                <input
                  value={athletePayout.payoutHandle}
                  onChange={(e) => setAthletePayout({ ...athletePayout, payoutHandle: e.target.value })}
                  placeholder="@username"
                />
              </label>
              <label>
                Bank account last 4 (optional)
                <input
                  value={athletePayout.bankLast4}
                  onChange={(e) => setAthletePayout({ ...athletePayout, bankLast4: e.target.value })}
                />
              </label>
            </div>
            <div style={{ marginTop: 12 }}>
              <button
                className="secondary-button"
                type="button"
                onClick={handleStartAthleteOnboarding}
                disabled={startingOnboarding}
              >
                {startingOnboarding ? "Redirecting..." : "Connect Stripe Payout Account"}
              </button>
            </div>

            <h2 style={{ marginTop: 24 }}>Instagram Diagnostics Connection</h2>
            <p style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
              Connect with Meta OAuth (recommended), or paste a token manually for diagnostics and performance XP rewards.
            </p>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
              <button className="secondary-button" type="button" onClick={handleStartInstagramOAuth}>
                Connect with Instagram OAuth
              </button>
              <span style={{ color: "#666", fontSize: 13 }}>
                {instagramConnection.connected ? "OAuth/manual connection active" : "No active Instagram OAuth connection"}
              </span>
            </div>
            <div className="form-grid" style={{ marginTop: 12 }}>
              <label>
                Instagram User ID (optional)
                <input
                  value={instagramConnection.igUserId}
                  onChange={(e) =>
                    setInstagramConnection((prev) => ({ ...prev, igUserId: e.target.value }))
                  }
                />
              </label>
              <label>
                Instagram Username (optional)
                <input
                  value={instagramConnection.igUsername}
                  onChange={(e) =>
                    setInstagramConnection((prev) => ({ ...prev, igUsername: e.target.value }))
                  }
                />
              </label>
              <label>
                Instagram Access Token
                <input
                  value={instagramConnection.accessToken}
                  onChange={(e) =>
                    setInstagramConnection((prev) => ({ ...prev, accessToken: e.target.value }))
                  }
                  placeholder="EAAG..."
                />
              </label>
            </div>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
              <button
                className="secondary-button"
                type="button"
                onClick={handleSaveInstagramConnection}
                disabled={connectingInstagram}
              >
                {connectingInstagram ? "Saving..." : "Save Instagram Connection"}
              </button>
              <span style={{ color: instagramConnection.connected ? "#2f855a" : "#888", fontSize: 13 }}>
                {instagramConnection.connected ? "Connected" : "Not connected"}
              </span>
            </div>
          </>
        )}

        {role === "business" && (
          <>
            <h2 style={{ marginTop: 24 }}>Business Profile</h2>
            <p style={{ color: "#666", fontSize: 13, marginTop: 4 }}>
              This information powers how your business appears to athletes across campaigns and discovery.
            </p>
            <div className="form-grid two" style={{ marginTop: 16 }}>
              <label>
                Business name
                <input
                  value={businessSettings.businessName}
                  onChange={(e) =>
                    setBusinessSettings({ ...businessSettings, businessName: e.target.value })
                  }
                />
              </label>
              <label>
                Website
                <input
                  value={businessSettings.website}
                  onChange={(e) =>
                    setBusinessSettings({ ...businessSettings, website: e.target.value })
                  }
                  placeholder="https://yourbrand.com"
                />
              </label>
              <label>
                Contact first name
                <input
                  value={businessSettings.contactFirstName}
                  onChange={(e) =>
                    setBusinessSettings({ ...businessSettings, contactFirstName: e.target.value })
                  }
                />
              </label>
              <label>
                Contact last name
                <input
                  value={businessSettings.contactLastName}
                  onChange={(e) =>
                    setBusinessSettings({ ...businessSettings, contactLastName: e.target.value })
                  }
                />
              </label>
              <label>
                Business Instagram handle (optional)
                <input
                  value={businessSettings.instagram}
                  onChange={(e) =>
                    setBusinessSettings({ ...businessSettings, instagram: e.target.value })
                  }
                />
              </label>
              <label>
                Category
                <input
                  value={businessSettings.category}
                  onChange={(e) =>
                    setBusinessSettings({ ...businessSettings, category: e.target.value })
                  }
                />
              </label>
              <label>
                City
                <input
                  value={businessSettings.city}
                  onChange={(e) =>
                    setBusinessSettings({ ...businessSettings, city: e.target.value })
                  }
                />
              </label>
              <label>
                State
                <input
                  value={businessSettings.state}
                  onChange={(e) =>
                    setBusinessSettings({ ...businessSettings, state: e.target.value })
                  }
                />
              </label>
              <label>
                Budget range
                <select
                  value={businessSettings.budgetRange}
                  onChange={(e) =>
                    setBusinessSettings({ ...businessSettings, budgetRange: e.target.value })
                  }
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
                Local radius
                <select
                  value={businessSettings.localRadius}
                  onChange={(e) =>
                    setBusinessSettings({ ...businessSettings, localRadius: e.target.value })
                  }
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
                Preferred athlete tier
                <select
                  value={businessSettings.preferredAthleteTier}
                  onChange={(e) =>
                    setBusinessSettings({
                      ...businessSettings,
                      preferredAthleteTier: e.target.value,
                    })
                  }
                >
                  <option value="">Select one</option>
                  <option value="Bronze">Bronze</option>
                  <option value="Silver">Silver</option>
                  <option value="Gold">Gold</option>
                  <option value="Platinum">Platinum</option>
                  <option value="Diamond">Diamond</option>
                  <option value="No Preference">No Preference</option>
                </select>
              </label>
              <label>
                Campaign interests
                <input
                  value={businessSettings.campaignInterests}
                  onChange={(e) =>
                    setBusinessSettings({ ...businessSettings, campaignInterests: e.target.value })
                  }
                  placeholder="Game day promos, reels, appearances"
                />
              </label>
              <label>
                How did you hear about HILLink?
                <input
                  value={businessSettings.heardAbout}
                  onChange={(e) =>
                    setBusinessSettings({ ...businessSettings, heardAbout: e.target.value })
                  }
                />
              </label>
            </div>

            <label style={{ display: "block", marginTop: 12 }}>
              Business description
              <textarea
                value={businessSettings.description}
                onChange={(e) =>
                  setBusinessSettings({ ...businessSettings, description: e.target.value })
                }
                rows={4}
                placeholder="Describe your business, audience, and the kinds of athlete campaigns you want to run."
              />
            </label>

            <h2 style={{ marginTop: 24 }}>Billing and Subscription Tier</h2>
            <div className="form-grid" style={{ marginTop: 12 }}>
              <label>
                Subscription tier
                <select
                  value={businessBilling.subscriptionTier}
                  onChange={(e) =>
                    setBusinessBilling({
                      ...businessBilling,
                      subscriptionTier: e.target.value as "starter" | "growth" | "scale" | "domination",
                    })
                  }
                >
                  <option value="starter">Starter - $250/mo - 3 slots</option>
                  <option value="growth">Growth - $400/mo - 6 slots</option>
                  <option value="scale">Scale - $700/mo - 12 slots</option>
                  <option value="domination">Domination - $1200+/mo - 20+ slots</option>
                </select>
              </label>
              <label>
                Billing contact name
                <input
                  value={businessBilling.billingName}
                  onChange={(e) => setBusinessBilling({ ...businessBilling, billingName: e.target.value })}
                />
              </label>
              <label>
                Billing email
                <input
                  type="email"
                  value={businessBilling.billingEmail}
                  onChange={(e) => setBusinessBilling({ ...businessBilling, billingEmail: e.target.value })}
                />
              </label>
              <label>
                Billing address line 1
                <input
                  value={businessBilling.billingAddressLine1}
                  onChange={(e) => setBusinessBilling({ ...businessBilling, billingAddressLine1: e.target.value })}
                />
              </label>
              <label>
                Billing city
                <input
                  value={businessBilling.billingCity}
                  onChange={(e) => setBusinessBilling({ ...businessBilling, billingCity: e.target.value })}
                />
              </label>
              <label>
                Billing state
                <input
                  value={businessBilling.billingState}
                  onChange={(e) => setBusinessBilling({ ...businessBilling, billingState: e.target.value })}
                />
              </label>
              <label>
                Billing postal code
                <input
                  value={businessBilling.billingPostalCode}
                  onChange={(e) => setBusinessBilling({ ...businessBilling, billingPostalCode: e.target.value })}
                />
              </label>
              <label>
                Country
                <input
                  value={businessBilling.billingCountry}
                  onChange={(e) => setBusinessBilling({ ...businessBilling, billingCountry: e.target.value })}
                />
              </label>
              <label>
                Card brand (placeholder)
                <input
                  value={businessBilling.cardBrand}
                  onChange={(e) => setBusinessBilling({ ...businessBilling, cardBrand: e.target.value })}
                  placeholder="visa"
                />
              </label>
              <label>
                Card last 4 (placeholder)
                <input
                  value={businessBilling.cardLast4}
                  onChange={(e) => setBusinessBilling({ ...businessBilling, cardLast4: e.target.value })}
                  placeholder="4242"
                />
              </label>
            </div>
            <div style={{ marginTop: 12 }}>
              <button
                className="secondary-button"
                type="button"
                onClick={handleStartBusinessCheckout}
                disabled={startingCheckout}
              >
                {startingCheckout ? "Redirecting..." : "Pay and Activate Tier (Stripe)"}
              </button>
            </div>
          </>
        )}

        <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
          <button
            className="secondary-button"
            type="button"
            onClick={handleSaveProfileSettings}
            disabled={savingProfile}
          >
            {savingProfile ? "Saving..." : "Save profile settings"}
          </button>
          {lastSavedAt && (
            <div style={{ alignSelf: "center", fontSize: 13, color: "#4b5563" }}>
              Saved at {lastSavedAt}
            </div>
          )}
        </div>

        <div className="form-grid" style={{ marginTop: 16 }}>
          <label>
            Account email
            <input value={accountEmail || "Unknown"} readOnly />
          </label>

          <label>
            Change account email (optional)
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="name@school.edu"
            />
          </label>

          <label>
            Current role
            <input value={role || "Unknown"} readOnly />
          </label>

          <label>
            Your referral code
            <input value={referralCode} readOnly />
          </label>

          <label>
            Referred by code
            <input value={referredByCode || "Not set"} readOnly />
          </label>

          <label>
            Enter referrer code (one-time)
            <input
              value={referralInput}
              onChange={(e) => setReferralInput(e.target.value.toUpperCase())}
              placeholder="HL-ABCD-1234"
              disabled={!!referredByCode || savingReferral}
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
          <button
            className="secondary-button"
            type="button"
            onClick={handleChangeEmail}
            disabled={changingEmail}
          >
            {changingEmail ? "Updating email..." : "Change email"}
          </button>
          <button className="secondary-button" type="button" onClick={handleCopy}>
            {copied ? "Copied" : "Copy code"}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={handleApplyReferral}
            disabled={!!referredByCode || savingReferral}
          >
            {referredByCode ? "Referrer locked" : savingReferral ? "Applying..." : "Apply referrer code"}
          </button>
          <button
            className="cta-button"
            type="button"
            onClick={() => router.push(role === "business" ? "/business" : "/athlete")}
          >
            Back to dashboard
          </button>
        </div>

        {(role === "athlete" || role === "business") && (
          <div
            style={{
              marginTop: 28,
              padding: 16,
              border: "1px solid #fecaca",
              background: "#fff1f2",
              borderRadius: 10,
            }}
          >
            <h3 style={{ margin: "0 0 8px 0", color: "#9f1239" }}>Danger Zone</h3>
            <p style={{ margin: 0, fontSize: 13, color: "#7f1d1d" }}>
              Terminating your account is permanent. Your access will be removed immediately.
            </p>
            <p style={{ margin: "6px 0 0 0", fontSize: 12, color: "#9f1239" }}>
              You will be asked to confirm and type TERMINATE before this runs.
            </p>
            <button
              type="button"
              onClick={handleTerminateAccount}
              disabled={terminatingAccount}
              style={{
                marginTop: 12,
                background: "#b91c1c",
                color: "#fff",
                border: "1px solid #991b1b",
                borderRadius: 8,
                padding: "10px 14px",
                fontWeight: 700,
                cursor: terminatingAccount ? "not-allowed" : "pointer",
                opacity: terminatingAccount ? 0.7 : 1,
              }}
            >
              {terminatingAccount ? "Terminating..." : "Terminate Account"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
