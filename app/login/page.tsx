"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();

  const [role, setRole] = useState<"business" | "athlete">("business");
  const [form, setForm] = useState({
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

          <h1>Log in</h1>
          <p>Select a role and enter the platform prototype.</p>
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
            This is a prototype login screen. It routes you to the selected role's
            dashboard.
          </div>

          <button className="cta-button full" type="submit">
            Log in as {role === "business" ? "Business" : "Athlete"}
          </button>
        </form>
      </div>
    </div>
  );
}
