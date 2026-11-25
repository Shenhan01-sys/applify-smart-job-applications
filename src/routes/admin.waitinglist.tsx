import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Download, RefreshCw, Search, Filter, Users, Calendar, TrendingUp,
  Loader2, ShieldCheck, ShieldOff, GraduationCap, ChevronLeft, ChevronRight,
  Sparkles, Mail, X, ExternalLink,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

// Whitelist email yang boleh akses admin (demo Solve-It).
// TODO production: ganti dengan profiles.is_admin atau custom JWT claim.
const ADMIN_EMAILS = new Set<string>([
  "hansgunawan775@gmail.com",
  "demo@applify.id",
]);

interface WaitinglistEntry {
  id: string;
  full_name: string;
  university: string;
  age: number;
  major: string;
  work_status: string;
  job_goal: string;
  location_goal: string;
  email: string | null;
  user_id: string | null;
  user_agent: string | null;
  referrer: string | null;
  created_at: string;
}

const PAGE_SIZE = 25;

export const Route = createFileRoute("/admin/waitinglist")({
  beforeLoad: async () => {
    if (isMockMode()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Admin · Waitinglist — Applify" }] }),
  component: AdminWaitinglistPage,
});

function AdminWaitinglistPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<WaitinglistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(0);

  const isAdmin = user?.email ? ADMIN_EMAILS.has(user.email) : false;

  const load = async () => {
    setRefreshing(true);
    const { data, error } = await supabase
      .from("waitinglist")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Daftar tunggu belum bisa dimuat. Muat ulang halaman, lalu coba lagi. Rincian: " + error.message);
    } else {
      setRows((data as WaitinglistEntry[]) ?? []);
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    load();
  }, []);

  // Stats
  const stats = useMemo(() => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const total = rows.length;
    const last24h = rows.filter((r) => now - new Date(r.created_at).getTime() < day).length;
    const last7d = rows.filter((r) => now - new Date(r.created_at).getTime() < 7 * day).length;
    const byStatus = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.work_status] = (acc[r.work_status] || 0) + 1;
      return acc;
    }, {});
    const byUniversity = rows.reduce<Record<string, number>>((acc, r) => {
      const key = r.university || "Tidak diisi";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const topUniversities = Object.entries(byUniversity)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    return { total, last24h, last7d, byStatus, topUniversities };
  }, [rows]);

  // Filtered rows
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.work_status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.full_name.toLowerCase().includes(q) ||
        r.university.toLowerCase().includes(q) ||
        r.major.toLowerCase().includes(q) ||
        r.job_goal.toLowerCase().includes(q) ||
        r.location_goal.toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, statusFilter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [query, statusFilter]);

  // CSV export
  const exportCSV = () => {
    if (filtered.length === 0) {
      toast.error("Tidak ada data untuk diexport");
      return;
    }
    const headers = [
      "created_at", "full_name", "university", "age", "major", "work_status",
      "job_goal", "location_goal", "email", "user_id", "referrer",
    ];
    const escape = (v: any): string => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };
    const lines = [
      headers.join(","),
      ...filtered.map((r) =>
        headers.map((h) => escape((r as any)[h])).join(",")
      ),
    ];
    const csv = lines.join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `applify-waitinglist-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Berhasil export ${filtered.length} baris`);
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#F4F1E8] flex items-center justify-center px-4">
        <div className="max-w-md w-full glass rounded-2xl p-8 text-center">
          <div className="mx-auto h-14 w-14 rounded-full bg-[#C0341A]/10 grid place-items-center">
            <ShieldOff className="h-6 w-6 text-[#C0341A]" />
          </div>
          <h1 className="mt-5 font-display text-2xl font-extrabold">403 — Akses Ditolak</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Email <span className="font-mono text-foreground">{user?.email ?? "(belum login)"}</span> belum
            punya akses ke admin panel. Hubungi super-admin untuk diinvite.
          </p>
          <Link
            to="/"
            className="mt-5 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl gradient-primary text-white text-sm font-semibold hover:opacity-90 transition"
          >
            Kembali ke Beranda
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F1E8]">
      <header className="sticky top-0 z-30 backdrop-blur-md bg-[#F4F1E8]/85 border-b border-[color:var(--border)]">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-lg gradient-primary text-white font-bold">A</div>
              <span className="text-lg font-bold">Applify</span>
            </Link>
            <span className="hidden sm:inline-flex items-center gap-1.5 h-6 px-2 rounded-full bg-[#16150F] text-[#D2F801] text-xs font-bold uppercase tracking-wider">
              <ShieldCheck className="h-3 w-3" /> Admin
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border-2 border-[color:var(--border)] bg-white text-sm font-semibold hover:bg-black/[3%] transition disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={exportCSV}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl gradient-primary text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-60"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Export CSV</span>
              <span className="sm:hidden">CSV</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        {/* Title */}
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.22em] text-[#0A5BE0] font-bold">Waitinglist</p>
          <h1 className="mt-1 font-display text-2xl md:text-3xl font-extrabold tracking-tight">
            Early Access <span className="text-gradient-primary">Pendaftar.</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Daftar calon pengguna yang isi waitinglist Applify.
          </p>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard icon={Users} label="Total" value={stats.total} accent="#0A5BE0" />
          <StatCard icon={Sparkles} label="24 jam" value={stats.last24h} accent="#D2F801" />
          <StatCard icon={Calendar} label="7 hari" value={stats.last7d} accent="#1C9656" />
          <StatCard
            icon={TrendingUp}
            label="Top kampus"
            value={stats.topUniversities[0]?.[1] ?? 0}
            sub={stats.topUniversities[0]?.[0] ?? "—"}
            accent="#D9741A"
          />
        </div>

        {/* Work status breakdown */}
        {Object.keys(stats.byStatus).length > 0 && (
          <div className="glass rounded-2xl p-5 mb-6">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground font-bold mb-3">
              Breakdown Status Kerja
            </p>
            <div className="space-y-2">
              {Object.entries(stats.byStatus)
                .sort((a, b) => b[1] - a[1])
                .map(([status, count]) => {
                  const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
                  return (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(statusFilter === status ? "all" : status)}
                      className={`block w-full text-left rounded-lg p-2 -mx-2 transition ${
                        statusFilter === status ? "bg-[#0A5BE0]/[6%]" : "hover:bg-black/[3%]"
                      }`}
                    >
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-semibold">{status}</span>
                        <span className="text-muted-foreground">
                          {count} · {pct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-black/[8%] overflow-hidden">
                        <div
                          className="h-full gradient-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
            </div>
            {statusFilter !== "all" && (
              <button
                onClick={() => setStatusFilter("all")}
                className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" /> Reset filter
              </button>
            )}
          </div>
        )}

        {/* Filter bar */}
        <div className="glass rounded-2xl p-3 mb-4 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama, email, universitas, prodi, job goal…"
              className="w-full h-10 pl-10 pr-3 rounded-lg border-2 border-[color:var(--border)] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0A5BE0]/30 focus:border-[#0A5BE0]"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded grid place-items-center text-muted-foreground hover:bg-black/[5%]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="relative sm:w-56">
            <Filter className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full h-10 pl-10 pr-3 rounded-lg border-2 border-[color:var(--border)] bg-white text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-[#0A5BE0]/30 focus:border-[#0A5BE0]"
            >
              <option value="all">Semua status</option>
              {Object.keys(stats.byStatus).sort().map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="glass rounded-2xl p-12 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-[#0A5BE0]" />
            <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest text-xs">
              Memuat data…
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-black/[5%] grid place-items-center">
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
            <h3 className="mt-3 font-display text-lg font-bold">Belum ada data</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {query || statusFilter !== "all"
                ? "Coba reset filter di atas."
                : "Belum ada yang submit waitinglist Applify."}
            </p>
          </div>
        ) : (
          <div className="glass rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-black/[3%] text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left font-semibold px-4 py-3">Waktu</th>
                    <th className="text-left font-semibold px-4 py-3">Nama</th>
                    <th className="text-left font-semibold px-4 py-3 hidden md:table-cell">Asal</th>
                    <th className="text-left font-semibold px-4 py-3 hidden lg:table-cell">Prodi</th>
                    <th className="text-left font-semibold px-4 py-3 hidden lg:table-cell">Status</th>
                    <th className="text-left font-semibold px-4 py-3 hidden xl:table-cell">Job Goal</th>
                    <th className="text-left font-semibold px-4 py-3 hidden xl:table-cell">Lokasi Goal</th>
                    <th className="text-left font-semibold px-4 py-3">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r, i) => (
                    <tr
                      key={r.id}
                      className={`border-t border-[color:var(--border)] hover:bg-[#0A5BE0]/[3%] transition ${
                        i % 2 === 0 ? "bg-white" : "bg-[#FBF9F2]"
                      }`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground font-mono">
                        {formatDateTime(r.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold">{r.full_name}</div>
                        <div className="text-xs text-muted-foreground md:hidden">
                          {r.university} · {r.age} th
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="text-sm">{r.university}</div>
                        <div className="text-xs text-muted-foreground">{r.age} tahun</div>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-sm">{r.major}</td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="inline-flex items-center h-6 px-2 rounded-full bg-[#0A5BE0]/10 text-[#0A5BE0] text-xs font-semibold">
                          {r.work_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell text-sm max-w-[200px] truncate" title={r.job_goal}>
                        {r.job_goal}
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell text-sm max-w-[160px] truncate" title={r.location_goal}>
                        <span className="inline-flex items-center gap-1">
                          <GraduationCap className="h-3 w-3 text-muted-foreground" />
                          {r.location_goal}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {r.email ? (
                          <a
                            href={`mailto:${r.email}`}
                            className="inline-flex items-center gap-1 text-[#0A5BE0] hover:underline text-sm"
                          >
                            <Mail className="h-3 w-3" />
                            <span className="truncate max-w-[160px]">{r.email}</span>
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-[color:var(--border)] text-sm">
                <span className="text-xs text-muted-foreground">
                  Menampilkan {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} dari{" "}
                  {filtered.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="h-8 w-8 rounded-lg border-2 border-[color:var(--border)] bg-white grid place-items-center hover:bg-black/[3%] disabled:opacity-40 transition"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-xs text-muted-foreground px-2">
                    {page + 1} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="h-8 w-8 rounded-lg border-2 border-[color:var(--border)] bg-white grid place-items-center hover:bg-black/[3%] disabled:opacity-40 transition"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Admin panel · RLS policy{" "}
          <code className="font-mono text-foreground">authenticated_select_waitinglist</code>
          {" "}— tolong ganti ke role-based policy sebelum production launch.
          <br />
          Data refresh: <span className="font-mono">{new Date().toLocaleString("id-ID")}</span>
          {" "}· <a href="https://supabase.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[#0A5BE0] hover:underline">Buka di Supabase <ExternalLink className="h-3 w-3" /></a>
        </p>
      </main>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  sub?: string;
  accent: string;
}) {
  return (
    <div className="glass rounded-2xl p-4 relative overflow-hidden">
      <div
        className="absolute -top-2 -right-2 h-12 w-12 rounded-full opacity-20 blur-xl"
        style={{ background: accent }}
      />
      <div className="flex items-center justify-between">
        <div
          className="h-8 w-8 rounded-lg grid place-items-center text-white"
          style={{ background: accent }}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 font-display text-2xl md:text-3xl font-extrabold">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-xs text-muted-foreground truncate mt-0.5" title={sub}>{sub}</p>}
    </div>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
