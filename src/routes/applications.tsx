import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import { LayoutGrid, List } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/applications")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Applications — Applify" }] }),
  component: AppsPage,
});

const cols = [
  { k: "sent", label: "Terkirim", color: "primary", items: [
    { c: "Bukalapak", r: "Backend Engineer", t: "2 hari" },
    { c: "Dana", r: "iOS Engineer", t: "20 menit" },
    { c: "Traveloka", r: "Mobile Engineer", t: "3 jam" },
  ] },
  { k: "ats", label: "ATS Screening", color: "teal", items: [
    { c: "Gojek", r: "Senior Backend", t: "1 hari" },
    { c: "Shopee", r: "Data Analyst", t: "2 hari" },
  ] },
  { k: "hr", label: "HR Review", color: "violet", items: [
    { c: "BCA Digital", r: "UI/UX Designer", t: "3 hari" },
  ] },
  { k: "interview", label: "Interview", color: "gold", items: [
    { c: "Tokopedia", r: "Product Manager", t: "Besok 14:00" },
    { c: "Mandiri", r: "Data Scientist", t: "Jumat 10:00" },
  ] },
  { k: "done", label: "Selesai", color: "warm", items: [
    { c: "Halodoc", r: "Frontend Lead", t: "Offer" },
  ] },
];

const colorMap: Record<string, string> = {
  primary: "border-[#0367FC] bg-[#0367FC] text-white",
  teal: "border-[#D2F801] bg-[#D2F801] text-[#161616]",
  violet: "border-[#161616] bg-[#161616] text-white",
  gold: "border-[#D2F801] bg-[#D2F801] text-[#161616]",
  warm: "border-[#D2F801] bg-[#D2F801] text-[#161616]",
};

function AppsPage() {
  const [view, setView] = useState<'kanban'|'list'>('kanban');
  return (
    <AppShell>
      <header className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Applications</h1>
          <p className="text-muted-foreground text-sm mt-1">Lacak setiap lamaran dari kirim sampai offer.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={()=>setView('kanban')} className={`hidden md:inline-flex h-10 px-3 rounded-lg items-center gap-2 text-sm border ${view==='kanban'?'gradient-primary text-white border-transparent':'border-black/[8%] bg-black/[4%]'}`}><LayoutGrid className="h-4 w-4"/> Kanban</button>
          <button onClick={()=>setView('list')} className={`h-10 px-3 rounded-lg inline-flex items-center gap-2 text-sm border ${view==='list'?'gradient-primary text-white border-transparent':'border-black/[8%] bg-black/[4%]'}`}><List className="h-4 w-4"/> List</button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { l: "Total Terkirim", v: "127" },
          { l: "Callback Rate", v: "23%" },
          { l: "Avg. Respons", v: "4.2 hari" },
          { l: "Platform Terbaik", v: "LinkedIn" },
        ].map((s) => (
          <div key={s.l} className="glass rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.l}</p>
            <p className="font-mono text-xl md:text-2xl font-bold mt-1">{s.v}</p>
          </div>
        ))}
      </div>

      {view === 'kanban' ? (
        <div className="hidden md:grid grid-cols-5 gap-3">
          {cols.map((c) => (
            <div key={c.k} className="glass rounded-2xl p-3 min-h-[400px]">
              <div className={`flex items-center justify-between rounded-lg border px-3 py-2 ${colorMap[c.color]}`}>
                <span className="text-xs font-semibold uppercase tracking-wider">{c.label}</span>
                <span className="text-xs font-mono">{c.items.length}</span>
              </div>
              <div className="mt-3 space-y-2">
                {c.items.map((it, i) => (
                  <div key={i} className="rounded-xl bg-black/[3%] border border-black/[6%] p-3 cursor-grab hover:bg-black/[5%] transition">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-md gradient-primary grid place-items-center text-white text-xs font-bold">{it.c[0]}</div>
                      <p className="text-sm font-semibold truncate">{it.c}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 truncate">{it.r}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 font-mono">{it.t}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Mobile / List view */}
      <div className={view==='list' ? 'block' : 'md:hidden'}>
        <div className="flex gap-2 overflow-x-auto pb-3 -mx-4 px-4 mb-3">
          {cols.map((c, i) => (
            <button key={c.k} className={`shrink-0 text-xs px-3 py-1.5 rounded-full border whitespace-nowrap ${i===0?'gradient-primary text-white border-transparent':'border-black/[8%] bg-black/[4%] text-muted-foreground'}`}>{c.label} · {c.items.length}</button>
          ))}
        </div>
        <div className="space-y-2">
          {cols.flatMap(c => c.items.map(it => ({...it, status: c.label, color: c.color}))).map((it, i) => (
            <div key={i} className="glass rounded-xl p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg gradient-primary grid place-items-center text-white font-bold">{it.c[0]}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{it.c}</p>
                <p className="text-xs text-muted-foreground truncate">{it.r}</p>
              </div>
              <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border font-semibold whitespace-nowrap ${colorMap[it.color]}`}>{it.status}</span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
