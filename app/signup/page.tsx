"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function SignupForm() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const presetRole = useMemo(() => {
    const role = searchParams.get("role");
    if (role === "athlete") return "athlete";
    return "business";
  }, [searchParams]);

  const [role, setRole] = useState<"business" | "athlete">(
    presetRole as "business" | "athlete"
  );
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function isStudentEmail(email: string) {
    return email.trim().toLowerCase().endsWith(".edu");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (role === "athlete" && !isStudentEmail(form.email)) {
      setError("Athlete accounts require a valid student email ending in .edu");
      return;
    }

    setLoading(true);

    const supabase = createClient();

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          intended_role: role,
        },
      },
    });

    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    if (process.env.NODE_ENV === "development") {
      console.log("Signup response:", data);
    }

    // Ensure the user goes through explicit login after signup.
    await supabase.auth.signOut();

    setSuccess(
      "Signup successful. A confirmation email has been sent. Please verify your email before logging in."
    );

    setTimeout(() => {
      router.push("/login");
    }, 1200);
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="landing-brand">
            <img src="/Hillink-logo-black-red.png" alt="HILLink" className="logo-image" />
          </div>

          <h1>Create your account</h1>
          <p>Choose your role and continue into the platform prototype.</p>
        </div>

        <div className="auth-controls">
          <div className="role-switch">
            <button
              type="button"
              className={role === "business" ? "active" : ""}
              onClick={() => setRole("business")}
            >
              Business
            </button>
            <button
              type="button"
              className={role === "athlete" ? "active" : ""}
              onClick={() => setRole("athlete")}
            >
              Athlete
            </button>
          </div>
        </div>

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
            Email
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>

          {role === "athlete" && (
            <div className="prototype-note" style={{ marginTop: -6 }}>
              Athlete accounts must use a student email ending in .edu.
            </div>
          )}

          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>

          <div className="prototype-note">
            This is a prototype signup screen. It routes you to the correct dashboard
            based on your selected role.
          </div>

          {error && <div className="error-message">Error: {error}</div>}
          {success && <div className="success-message">{success}</div>}

          <button className="cta-button full" type="submit" disabled={loading}>
            {loading ? "Signing up..." : `Continue as ${role === "business" ? "Business" : "Athlete"}`}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="auth-shell"><div className="auth-card">Loading...</div></div>}>
      <SignupForm />
    </Suspense>
  );
}
