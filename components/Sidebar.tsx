"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const logo = "https://ixhlpassuqmqpzpumkuw.supabase.co/storage/v1/object/public/mentoracity-logo/mentoracity_logo_vr.webp";
const items = [
  { href: "/coachings", icon: "◈", label: "Coaching centers" },
  { href: "/seo-audit", icon: "◌", label: "SEO audit" },
  { href: "/seo-versions", icon: "⟳", label: "SEO versions" },
  { href: "/content-queue", icon: "◫", label: "Content queue" },
  { href: "/blogs", icon: "▤", label: "Blogs", soon: true },
];

type SidebarLinkProps = { href: string; icon: string; label: string; active: boolean; soon?: boolean };

function SidebarLink({ href, icon, label, active, soon }: SidebarLinkProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link className={`nav-item ${active ? "active" : ""}`} href={href} aria-label={label}>
          <span className="nav-icon" aria-hidden="true">{icon}</span>
          <span className="nav-text">{label}</span>
          {soon && <small className="soon-badge">Soon</small>}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" align="center" className="sidebar-tooltip">{label}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="brand"><img className="sidebar-logo" src={logo} alt="MentoraCity" /></div>
      <TooltipProvider delayDuration={180} skipDelayDuration={100}>
        <div className="nav-label">Workspace</div>
        {items.map((item) => <SidebarLink key={item.href} {...item} active={pathname.startsWith(item.href)} />)}
        <div className="nav-label">System</div>
        <SidebarLink href="/settings" icon="⚙" label="Settings" active={pathname.startsWith("/settings")} />
      </TooltipProvider>
      <div className="sidebar-foot">SEO changes are audited<br />and versioned automatically.</div>
    </aside>
  );
}
