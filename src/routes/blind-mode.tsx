import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/app/AppShell";
import { isMockMode } from "@/lib/appConfig";
import { EyeOff, Eye, Database, Clock } from "lucide-react";

export const Route = createFileRoute("/blind-mode")({
  beforeLoad: async () => {
    if (isMockMode()) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Mode Anonim — Applify" }] }),
  component: BlindModePage,
});

// Isi halaman ini sengaja hanya menyebut yang benar-benar ada di kode: tombol "Mode Anonim" di pratinjau CV pada
// halaman Profil menyamarkan tampilan saja (state lokal). Belum ada pengaturan tersimpan dan belum memengaruhi
// draf atau lamaran yang dibuat agen.
const CARDS = [
  { icon: Eye, title: "Pratinjau di layar", desc: "Di Profil Saya, tombol Mode Anonim menyamarkan nama dan sebagian riwayat di pratinjau CV. Kamu bisa melihat bagaimana CV terbaca tanpa identitas." },
  { icon: Database, title: "Datamu tidak berubah", desc: "Tombol itu hanya mengubah tampilan. Tidak ada pengaturan yang disimpan, dan draf lamaran yang dibuat agen belum memakainya." },
  { icon: Clock, title: "Segera hadir", desc: "Lamaran yang benar-benar menyembunyikan identitas belum tersedia. Fitur ini baru berupa rencana pengembangan." },
] as const;

function BlindModePage() {
  return (
    <AppShell>
      <div className="max-w-3xl animate-fade-in-up">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#16150F] text-white px-3 py-1 text-xs font-bold">
          <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> Mode Anonim (pratinjau)
        </span>
        <h1 className="mt-4 text-3xl md:text-4xl font-bold tracking-tight">Lihat CV-mu <span className="text-gradient-primary">tanpa identitas.</span></h1>
        <p className="mt-3 text-muted-foreground">
          Banyak orang ingin dinilai dari skill dan pencapaian lebih dulu. Mode Anonim membantumu membayangkan bagaimana CV terbaca bila nama dan latar belakang disembunyikan.
          Saat ini fitur ini baru berupa pratinjau.
        </p>
        <ul className="mt-8 grid gap-4 md:grid-cols-3">
          {CARDS.map((c, i) => (
            <li key={c.title} className="glass rounded-2xl p-5" style={{ animation: `fadeInUp 0.4s ease-out ${0.15 + i * 0.1}s both` }}>
              <c.icon className="h-6 w-6 text-violet" aria-hidden="true" />
              <h2 className="mt-3 font-semibold">{c.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{c.desc}</p>
            </li>
          ))}
        </ul>
        <Link
          to="/profile"
          className="mt-8 inline-flex min-h-11 items-center rounded-xl gradient-primary px-5 text-sm font-semibold text-white glow-primary"
        >
          Coba pratinjau di Profil Saya
        </Link>
      </div>
    </AppShell>
  );
}
