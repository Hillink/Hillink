"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function SignupForm() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const presetRole = useMemo(() => {
    const role = searchParams.get("role");
    if (role === "athlete") return "athlete";
    return "business";
  }, [searchParams]);

  const [role, setRole] = useState<"business" | "athlete">(presetRole as "business" | "athlete");
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (role === "business") {
      router.push("/business");
    } else {
      router.push("/athlete");
    }
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

          <button className="cta-button full" type="submit">
            Continue as {role === "business" ? "Business" : "Athlete"}
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
