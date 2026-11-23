import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

/**
 * Portal Uji Applify: formulir lamaran tiruan di domain Applify sendiri, untuk membuktikan jalur kirim agen
 * (isi formulir, tekan kirim, deteksi halaman konfirmasi) tanpa mengirim apa pun ke perusahaan sungguhan.
 * Tidak menyimpan data: isian hanya divalidasi di peramban lalu halaman menampilkan konfirmasi.
 * Worker hanya boleh menekan kirim di host yang ada di SUBMIT_ALLOWED_HOSTS, jadi host ini bisa diizinkan sendiri.
 */
export const Route = createFileRoute("/uji-portal")({
  head: () => ({
    meta: [
      { title: "Portal Uji Applify — Formulir Lamaran Tiruan" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: UjiPortalPage,
});

type Fields = {
  nama: string;
  email: string;
  telepon: string;
  kota: string;
  posisi: string;
  surat: string;
  setuju: boolean;
};

const REQUIRED: Array<keyof Fields> = ["nama", "email", "telepon", "surat", "setuju"];

export function validateUjiPortal(f: Fields): Partial<Record<keyof Fields, string>> {
  const errors: Partial<Record<keyof Fields, string>> = {};
  for (const k of REQUIRED) {
    const v = f[k];
    if (typeof v === "boolean" ? !v : v.trim() === "") errors[k] = "Wajib diisi.";
  }
  if (!errors.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) errors.email = "Format email tidak valid.";
  return errors;
}

function UjiPortalPage() {
  const [f, setF] = useState<Fields>({ nama: "", email: "", telepon: "", kota: "", posisi: "", surat: "", setuju: false });
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>({});
  const [kode, setKode] = useState<string | null>(null);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const found = validateUjiPortal(f);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setKode(`UJI-${Date.now().toString(36).toUpperCase()}`);
  };

  const set = (k: keyof Fields) => (e: { target: { value: string; checked?: boolean; type?: string } }) =>
    setF((p) => ({ ...p, [k]: e.target.type === "checkbox" ? !!e.target.checked : e.target.value }));

  if (kode) {
    return (
      <main className="mx-auto max-w-xl px-4 py-12">
        <h1 className="text-2xl font-bold">Terima kasih telah melamar</h1>
        <p className="mt-3">Lamaran Anda sudah kami terima. Nomor referensi: <span className="font-mono font-semibold">{kode}</span>.</p>
        <p className="mt-3 text-sm text-muted-foreground">
          Ini Portal Uji Applify, bukan lowongan sungguhan. Tidak ada data yang disimpan atau diteruskan ke perusahaan.
        </p>
      </main>
    );
  }

  const field = (k: keyof Fields, label: string, type = "text", required = false) => (
    <div className="mt-4">
      <label htmlFor={k} className="block text-sm font-semibold">
        {label}{required && <span className="text-red-700"> *</span>}
      </label>
      <input
        id={k}
        name={k}
        type={type}
        value={f[k] as string}
        onChange={set(k)}
        aria-invalid={!!errors[k]}
        aria-describedby={errors[k] ? `${k}-err` : undefined}
        className="mt-1 w-full rounded-lg border-2 border-black/20 bg-white px-3 py-2"
      />
      {errors[k] && <p id={`${k}-err`} role="alert" className="mt-1 text-sm text-red-700">{label}: {errors[k]}</p>}
    </div>
  );

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <p className="inline-block rounded-full bg-[#D2F801] px-3 py-1 text-xs font-semibold">Portal Uji Applify · bukan lowongan sungguhan</p>
      <h1 className="mt-3 text-2xl font-bold">Formulir Lamaran Kerja</h1>
      <p className="mt-1 text-sm text-muted-foreground">Posisi: Staf Uji Coba · Perusahaan: Portal Uji Applify</p>
      <form id="applyForm" noValidate onSubmit={onSubmit} className="mt-4">
        {field("nama", "Nama Lengkap", "text", true)}
        {field("email", "Email", "email", true)}
        {field("telepon", "Nomor Telepon", "tel", true)}
        {field("kota", "Kota Domisili")}
        {field("posisi", "Posisi Saat Ini")}
        <div className="mt-4">
          <label htmlFor="surat" className="block text-sm font-semibold">Surat Lamaran<span className="text-red-700"> *</span></label>
          <textarea
            id="surat"
            name="surat"
            rows={6}
            value={f.surat}
            onChange={set("surat")}
            aria-invalid={!!errors.surat}
            className="mt-1 w-full rounded-lg border-2 border-black/20 bg-white px-3 py-2"
          />
          {errors.surat && <p role="alert" className="mt-1 text-sm text-red-700">Surat Lamaran: {errors.surat}</p>}
        </div>
        <div className="mt-4 flex items-start gap-2">
          <input id="setuju" name="setuju" type="checkbox" checked={f.setuju} onChange={set("setuju")} className="mt-1" />
          <label htmlFor="setuju" className="text-sm">Saya menyatakan data di atas benar.<span className="text-red-700"> *</span></label>
        </div>
        {errors.setuju && <p role="alert" className="mt-1 text-sm text-red-700">Pernyataan: {errors.setuju}</p>}
        <button id="submitBtn" type="submit" className="mt-6 rounded-xl bg-[#16150F] px-6 py-3 font-semibold text-[#F4F1E8]">
          Kirim Lamaran
        </button>
      </form>
    </main>
  );
}
