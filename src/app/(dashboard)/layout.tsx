"use client";

import { useEffect } from "react";
import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  LayoutDashboardIcon,
  FileTextIcon,
  PaperclipIcon,
  SearchIcon,
  UsersIcon,
  ScrollIcon,
  MenuIcon,
  LogOutIcon,
  SunIcon,
  MoonIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { OrgSwitcher } from "@/components/orgs/org-switcher";
import { ErrorBoundary } from "@/components/layout/error-boundary";
import { useAuth } from "@/hooks/use-auth";
import { useOrgStore } from "@/stores/org-store";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/notes", label: "Notes", icon: FileTextIcon },
  { href: "/files", label: "Files", icon: PaperclipIcon },
  { href: "/search", label: "Search", icon: SearchIcon },
  { href: "/admin/members", label: "Members", icon: UsersIcon },
  { href: "/admin/audit-log", label: "Audit Log", icon: ScrollIcon },
];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  if (!mounted) return <Skeleton className="size-7 rounded-lg" />;

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
    </Button>
  );
}

function SidebarNav({ pathname }: { pathname: string }) {
  return (
    <nav className="flex flex-col gap-1 px-2">
      {navItems.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon className="size-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarContent({ pathname, onLogout }: { pathname: string; onLogout: () => void }) {
  const { user, loading } = useAuth();

  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : "?";

  return (
    <div className="flex h-full flex-col">
      {/* Org switcher */}
      <div className="p-3">
        <OrgSwitcher />
      </div>

      <Separator />

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-3">
        <SidebarNav pathname={pathname} />
      </div>

      <Separator />

      {/* User info + logout */}
      <div className="p-3">
        {loading ? (
          <div className="flex items-center gap-2">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex flex-col gap-1">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Avatar size="sm">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-1 flex-col min-w-0">
              <span className="truncate text-sm font-medium leading-none">
                {user?.email ?? "Unknown"}
              </span>
            </div>
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onLogout}
              title="Sign out"
            >
              <LogOutIcon className="size-4" />
              <span className="sr-only">Sign out</span>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  async function handleLogout() {
    try {
      const supabase = createClient();
      useOrgStore.getState().setActiveOrgId(null);
      await supabase.auth.signOut();
      router.replace("/login");
    } catch {
      toast.error("Failed to sign out");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-12 w-48" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar — fixed height, only nav section scrolls */}
      <aside className="hidden w-60 shrink-0 border-r bg-card md:flex md:flex-col h-screen">
        <SidebarContent pathname={pathname} onLogout={handleLogout} />
      </aside>

      {/* Mobile header + sheet */}
      <div className="flex flex-1 flex-col min-h-0">
        <header className="flex h-12 items-center gap-3 border-b bg-card px-4 md:hidden">
          <Sheet>
            <SheetTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label="Open menu" />}
            >
              <MenuIcon className="size-4" />
            </SheetTrigger>
            <SheetContent side="left" className="w-60 p-0">
              <SheetHeader className="sr-only">
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <SidebarContent pathname={pathname} onLogout={handleLogout} />
            </SheetContent>
          </Sheet>
          <span className="text-sm font-semibold">Team Notes</span>
        </header>

        {/* Page content — scrollable independently from sidebar */}
        <main className="flex-1 overflow-y-auto min-h-0">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
