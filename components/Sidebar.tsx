"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const logo = "https://ixhlpassuqmqpzpumkuw.supabase.co/storage/v1/object/public/mentoracity-logo/mentoracity_logo_vr.webp";
const items = [{ href: "/coachings", icon: "◈", label: "Coaching centers" }, { href: "/seo-audit", icon: "◌", label: "SEO audit" }, { href: "/content-queue", icon: "◫", label: "Content queue" }, { href: "/blogs", icon: "▤", label: "Blogs", soon: true }];
export function Sidebar() { const pathname = usePathname(); return <aside className="sidebar"><div className="brand"><img className="sidebar-logo" src={logo} alt="MentoraCity" /></div><div className="nav-label">Workspace</div>{items.map((item) => <Link className={`nav-item ${pathname.startsWith(item.href) ? "active" : ""}`} href={item.href} key={item.href}><span>{item.icon}</span><span>{item.label}</span>{item.soon && <small className="soon-badge">Soon</small>}</Link>)}<div className="nav-label">System</div><Link className={`nav-item ${pathname.startsWith("/settings") ? "active" : ""}`} href="/settings"><span>⚙</span><span>Settings</span></Link><div className="sidebar-foot">SEO changes are audited<br/>and versioned automatically.</div></aside>; }
