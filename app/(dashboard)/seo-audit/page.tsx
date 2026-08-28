import { Suspense } from "react";
import { AuditDashboard } from "@/components/audit/AuditDashboard";

export default function SeoAuditPage() {
  return <Suspense fallback={<main className="content"><div className="empty-state">Loading audit workspace…</div></main>}><AuditDashboard /></Suspense>;
}