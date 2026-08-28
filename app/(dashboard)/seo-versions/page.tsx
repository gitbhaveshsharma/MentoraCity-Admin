import { Suspense } from "react";
import { SeoVersionsDashboard } from "@/components/seo/SeoVersionsDashboard";

export default function SeoVersionsPage() {
  return (
    <Suspense
      fallback={
        <main className="content">
          <div className="page-head">
            <div>
              <span className="badge badge-source">SEO operations</span>
              <h1 className="page-title" style={{ marginTop: 9 }}>
                SEO versions
              </h1>
              <p className="page-sub">Loading version history…</p>
            </div>
          </div>
        </main>
      }
    >
      <SeoVersionsDashboard />
    </Suspense>
  );
}
