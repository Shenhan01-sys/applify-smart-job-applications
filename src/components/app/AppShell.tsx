import { Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Briefcase, FileCheck2, Radar, EyeOff, Settings, User, LogOut, Bot, ShieldCheck, Leaf, Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { HELP_NAV_ITEM, MOBILE_TAB_ITEMS, NAV_GROUPS, NAV_ITEMS, isActivePath, type NavItem } from "@/lib/navItems";
import { InAppNotificationsBell } from "@/components/app/InAppNotificationsBell";

const ICONS: Record<NavItem["to"], typeof Bot> = {
  "/dashboard": LayoutDashboard,
  "/jobs": Briefcase,
  "/applications": FileCheck2,
  "/approvals": ShieldCheck,
  "/profile": User,
  "/automation-settings": Bot,
  "/skill-radar": Radar,
  "/blind-mode": EyeOff,
  "/green-career": Leaf,
  "/settings": Settings,
};

export default function AppShell({ children, rightPanel }: { children: React.ReactNode; rightPanel?: React.ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const email = user?.email ?? "";
  const displayName = email.split("@")[0] || "Pengguna";
  const initials = email.slice(0, 2).toUpperCase() || "AP";

  // Kelas gaya aplikasi juga dipasang di <html> supaya dialog dan laci Radix (dirender di portal) ikut rapi.
  useEffect(() => {
    document.documentElement.classList.add("app-ui");
    return () => document.documentElement.classList.remove("app-ui");
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/" });
  };

  return (
    <div className="app-ui min-h-screen flex">
      <a
        href="#konten-utama"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:shadow-lg"
      >
        Lewati ke konten utama
      </a>

      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex flex-col w-60 shrink-0 border-r border-black/[6%] bg-card/80 px-4 py-5 sticky top-0 h-screen overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <Link to="/dashboard" className="flex items-center gap-2 px-2 min-h-11">
            <div className="grid h-9 w-9 place-items-center rounded-lg gradient-primary text-white font-bold" aria-hidden="true">A</div>
            <span className="text-lg font-bold">Applify</span>
          </Link>
          <InAppNotificationsBell />
        </div>
        <div className="mt-6 glass rounded-xl p-3 flex items-center gap-3">
          <div className="h-9 w-9 shrink-0 rounded-full gradient-primary grid place-items-center text-white text-sm font-bold" aria-hidden="true">{initials}</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate" title={email}>{email}</p>
          </div>
        </div>
        <NavList path={path} />
        <AgentNote />
        <button type="button" onClick={handleSignOut} className="mt-3 flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition">
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Keluar
        </button>
      </aside>

      {/* Main */}
      <main id="konten-utama" tabIndex={-1} className="flex-1 min-w-0 flex flex-col lg:flex-row focus:outline-none">
        <div className="flex-1 min-w-0 px-4 md:px-8 py-6 pb-28 lg:pb-8">
          {/* Mobile header */}
          <div className="lg:hidden flex items-center justify-between mb-5">
            <Link to="/dashboard" className="flex items-center gap-2 min-h-11">
              <div className="grid h-8 w-8 place-items-center rounded-lg gradient-primary text-white font-bold" aria-hidden="true">A</div>
              <span className="font-bold">Applify</span>
            </Link>
            <div className="flex items-center gap-2">
              <InAppNotificationsBell />
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label="Buka menu"
                aria-haspopup="dialog"
                aria-expanded={menuOpen}
                className="h-11 w-11 rounded-full glass grid place-items-center"
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
          {children ?? <Outlet />}
        </div>
        {rightPanel && (
          <aside className="hidden xl:block w-[320px] shrink-0 border-l border-black/[6%] bg-card/80 px-5 py-6">
            {rightPanel}
          </aside>
        )}
      </main>

      <MobileTabBar path={path} />

      {/* Laci menu ponsel: Radix Sheet (Esc menutup, fokus terkunci, dibaca sebagai dialog) */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="right" className="lg:hidden w-72 max-w-[85%] overflow-y-auto bg-[#F4F1E8] p-4">
          <SheetHeader className="mb-4 pr-8 text-left">
            <SheetTitle className="font-display font-extrabold">Menu Applify</SheetTitle>
            <SheetDescription className="truncate">{email || "Belum masuk"}</SheetDescription>
          </SheetHeader>
          <NavList path={path} onNavigate={() => setMenuOpen(false)} />
          <AgentNote onNavigate={() => setMenuOpen(false)} />
          <button type="button" onClick={handleSignOut} className="mt-3 flex min-h-11 items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition">
            <LogOut className="h-4 w-4" aria-hidden="true" /> Keluar
          </button>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function NavList({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Menu utama" className="mt-6 flex-1 flex flex-col gap-4">
      {NAV_GROUPS.map((group) => (
        <div key={group.title} className="flex flex-col gap-1">
          <p className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/75">{group.title}</p>
          {group.items.map((to) => {
            const it = NAV_ITEMS.find((item) => item.to === to);
            if (!it) return null;
            const active = isActivePath(path, it.to);
            const Icon = ICONS[it.to];
            return (
              <Link
                key={it.to}
                to={it.to}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${active ? "gradient-primary text-white shadow-md" : "text-muted-foreground hover:bg-black/[4%] hover:text-foreground"}`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{it.label}</span>
                {it.to === "/blind-mode" && (
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${active ? "bg-white/20 text-white" : "bg-black/[6%] text-muted-foreground"}`}>
                    Pratinjau
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/**
 * Pengganti sakelar "Status Agen" lama. Sakelar itu hanya menyimpan nilai di state lokal dan kembali ke
 * "aktif" tiap pindah halaman, jadi tidak mengendalikan apa pun. Teks ini menjelaskan hal yang benar-benar
 * dijamin aplikasi: lamaran tidak dikirim tanpa persetujuan pengguna.
 */
function AgentNote({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="mt-4 rounded-xl border border-teal/30 bg-teal/5 p-3 text-xs leading-relaxed">
      <p className="flex items-center gap-1.5 font-semibold text-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-teal" aria-hidden="true" /> Kamu yang memutuskan
      </p>
      <p className="mt-1 text-muted-foreground">
        Agen tidak mengirim lamaran sebelum kamu menyetujuinya di{" "}
        <Link to="/approvals" onClick={onNavigate} className="font-semibold text-primary underline-offset-2 hover:underline">
          Persetujuan
        </Link>.
      </p>
      {/* Halaman Bantuan (cara kerja, glosarium, FAQ "kenapa belum terkirim") dari menu di semua layar. */}
      <Link to={HELP_NAV_ITEM.to} onClick={onNavigate} className="mt-2 inline-flex min-h-11 items-center font-semibold text-primary underline-offset-2 hover:underline">
        {HELP_NAV_ITEM.label}: cara kerja dan tanya jawab
      </Link>
    </div>
  );
}

function MobileTabBar({ path }: { path: string }) {
  return (
    <nav aria-label="Menu cepat" className="lg:hidden fixed bottom-0 inset-x-0 z-40 glass-strong border-t border-black/[8%] px-1 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="grid grid-cols-5 gap-1">
        {MOBILE_TAB_ITEMS.map((it) => {
          const active = isActivePath(path, it.to);
          const Icon = ICONS[it.to];
          return (
            <Link
              key={it.to}
              to={it.to}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center rounded-lg py-1.5 ${active ? "text-primary font-semibold" : "text-muted-foreground"}`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="mt-0.5 text-xs leading-tight">{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
