"use client";

import { usePathname, useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const isNested = pathname !== "/coachings";
  const crumb = pathname.startsWith("/coachings")
    ? "Coaching centers"
    : pathname.slice(1).replaceAll("-", " ");

  return (
    <header className="topbar">
      <div className="header-left">
        {isNested && (
          <button className="back-btn" onClick={() => router.back()} aria-label="Go back">
            ← Back
          </button>
        )}
        <div className="crumb">
          Workspace <span> / </span> <strong>{crumb}</strong>
        </div>
      </div>
      <div className="admin-pill">
        <ThemeToggle />
        <span>Admin workspace</span>
        <span className="avatar">AD</span>
      </div>
    </header>
  );
}
