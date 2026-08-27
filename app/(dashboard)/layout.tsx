import { Sidebar } from "@/components/Sidebar";
import { Toaster } from "sonner";
import { Header } from "@/components/Header";
export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <div className="shell"><Sidebar /><div className="main"><Header />{children}<Toaster position="top-right" richColors /></div></div>; }
