import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Briefcase, FileCheck2, Radar, EyeOff, Settings, Bell, Power, Sparkles, User } from "lucide-react";
import { useState } from "react";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/jobs", label: "Job Feed", icon: Briefcase },
  { to: "/applications", label: "Applications", icon: FileCheck2 },
  { to: "/skill-radar", label: "Skill Radar", icon: Radar },
  { to: "/blind-mode", label: "Blind Merit Mode", icon: EyeOff },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export default function AppShell({ children, rightPanel }: { children: React.ReactNode; rightPanel?: React.ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [agentOn, setAgentOn] = useState(true);

  return (
    <div className="min-h-screen flex">
      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex flex-col w-60 shrink-0 border-r border-white/5 bg-card/40 px-4 py-5 sticky top-0 h-screen">
        <Link to="/" className="flex items-center gap-2 px-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg gradient-primary text-white font-bold">A</div>
          <span className="text-lg font-bold">Applify</span>
        </Link>
        <div className="mt-6 glass rounded-xl p-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-full gradient-primary grid place-items-center text-white text-sm font-bold">RA</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">Rizky A.</p>
            <p className="text-[10px] uppercase tracking-wider text-gold font-mono">Pro Member</p>
          </div>
        </div>
        <nav className="mt-6 flex-1 flex flex-col gap-1">
          {nav.map((it) => {
            const active = path === it.to;
            return (
              <Link key={it.to} to={it.to as any} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${active ? 'gradient-primary text-white shadow-md glow-primary' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}>
                <it.icon className="h-4 w-4" />
                {it.label}
              </Link>
            );
          })}
        </nav>
        <AgentToggle on={agentOn} setOn={setAgentOn} />
        <p className="mt-3 text-[10px] text-text-muted text-center font-mono">v1.0.0 · feedback</p>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col lg:flex-row">
        <div className="flex-1 min-w-0 px-4 md:px-8 py-6 pb-24 lg:pb-8">
          {/* Mobile header */}
          <div className="lg:hidden flex items-center justify-between mb-5">
            <Link to="/" className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg gradient-primary text-white font-bold">A</div>
              <span className="font-bold">Applify</span>
            </Link>
            <button className="relative h-10 w-10 rounded-full glass grid place-items-center">
              <Bell className="h-4 w-4" />
              <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-warm" />
            </button>
          </div>
          {children ?? <Outlet />}
        </div>
        {rightPanel && (
          <aside className="hidden xl:block w-[320px] shrink-0 border-l border-white/5 bg-card/40 px-5 py-6">
            {rightPanel}
          </aside>
        )}
      </main>

      <MobileNav agentOn={agentOn} setAgentOn={setAgentOn} />
    </div>
  );
}

function AgentToggle({ on, setOn }: { on: boolean; setOn: (v: boolean) => void }) {
  return (
    <button onClick={() => setOn(!on)} className={`mt-4 group rounded-xl border p-3 text-left transition ${on ? 'border-teal/30 bg-teal/5' : 'border-white/10 bg-white/5'}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Status Agen</span>
        <div className={`h-6 w-11 rounded-full transition relative ${on ? 'gradient-success' : 'bg-white/10'}`}>
          <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        {on ? (
          <>
            <span className="h-2 w-2 rounded-full bg-teal animate-pulse-glow" />
            <p className="text-xs"><span className="font-semibold text-teal">Aktif</span> · 7 platform</p>
          </>
        ) : (
          <>
            <Power className="h-3 w-3 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Nonaktif</p>
          </>
        )}
      </div>
    </button>
  );
}

function MobileNav({ agentOn, setAgentOn }: { agentOn: boolean; setAgentOn: (v: boolean) => void }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const items = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Home" },
    { to: "/jobs", icon: Briefcase, label: "Jobs" },
    { to: "/applications", icon: FileCheck2, label: "Apps" },
    { to: "/skill-radar", icon: Radar, label: "Skill" },
    { to: "/profile", icon: User, label: "Profile" },
  ] as const;
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 glass-strong border-t border-white/10 px-2 pt-2 pb-3">
      <div className="relative grid grid-cols-5 gap-1">
        {items.slice(0,2).map((it) => <NavBtn key={it.to} {...it} active={path===it.to} />)}
        <button onClick={()=>setAgentOn(!agentOn)} className="flex flex-col items-center justify-center -mt-6">
          <div className={`h-14 w-14 rounded-full grid place-items-center ${agentOn?'gradient-success glow-success':'bg-white/10 border border-white/20'}`}>
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <span className="text-[10px] mt-1 text-muted-foreground">{agentOn?'Agen ON':'Agen OFF'}</span>
        </button>
        {items.slice(2).map((it) => <NavBtn key={it.to} {...it} active={path===it.to} />)}
      </div>
    </nav>
  );
}

function NavBtn({ to, icon: Icon, label, active }: any) {
  return (
    <Link to={to} className={`flex flex-col items-center justify-center py-1.5 rounded-lg ${active?'text-primary':'text-muted-foreground'}`}>
      <Icon className="h-5 w-5" />
      <span className="text-[10px] mt-0.5">{label}</span>
    </Link>
  );
}
