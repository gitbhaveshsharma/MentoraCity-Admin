import { Suspense } from "react";
import { PagesDashboard } from "@/components/seo/PagesDashboard";

export default function PagesPage() {
  return (
    <Suspense
      fallback={
        <main className="content">
          <div className="page-head">
            <div>
              <h1 className="page-title" style={{ marginTop: 9 }}>
                Pages
              </h1>
              <p className="page-sub">Loading page inventory…</p>
            </div>
          </div>
        </main>
      }
    >
      <PagesDashboard />
    </Suspense>
  );
}
