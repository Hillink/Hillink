"use client";

import { useEffect, useState } from "react";

type Role = "business" | "athlete" | "admin";

export function useRole() {
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadRole = async () => {
      try {
        const res = await fetch("/api/me", { cache: "no-store" });
        if (!mounted) return;

        if (!res.ok) {
          setRole(null);
          setLoading(false);
          return;
        }

        const data = (await res.json()) as { role?: Role };
        setRole(data.role ?? null);
      } catch {
        if (mounted) {
          setRole(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadRole();
    return () => {
      mounted = false;
    };
  }, []);

  return { role, loading };
}
