
"use client";

import Link from "next/link";
import { useRole } from "@/lib/useRole";

export default function Sidebar() {
  const { role } = useRole();

  return (
    <div style={{ width: 200, background: "#111", color: "white", height: "100vh", padding: 20 }}>
      <h3>HILLink</h3>
      <p><Link href="/" style={{ color: "white" }}>Home</Link></p>
      {role === "business" && <p><Link href="/business" style={{ color: "white" }}>My Campaigns</Link></p>}
      {role === "athlete" && <p><Link href="/athlete" style={{ color: "white" }}>Browse Campaigns</Link></p>}
      {role === "admin" && <p><Link href="/admin" style={{ color: "white" }}>Admin Panel</Link></p>}
      {role === "admin" && <p><Link href="/admin/notifications" style={{ color: "white" }}>Notification Send-Out</Link></p>}
      <p><Link href="/settings" style={{ color: "white" }}>Settings</Link></p>
    </div>
  );
}
