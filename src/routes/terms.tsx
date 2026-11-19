import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Ketentuan & Privasi — Applify" }] }),
  component: TermsPage,
});

// Isi halaman ini harus tetap sama dengan perilaku kode. Setiap pernyataan diperiksa terhadap skema database
// (database/schema.sql), fungsi draf AI (supabase/functions/generate-application), dan fitur yang benar-benar ada.
// Kontak peneliti sengaja belum diisi: ganti penanda di bawah setelah datanya ada.
const DATA_STORED = [
  "Akun: email dan identitas login (dikelola Supabase Auth). Bila kamu masuk dengan Google, Google memberi tahu Applify email dan namamu.",
  "Profil: nama, jabatan, lokasi, nomor telepon, tautan LinkedIn dan portofolio, pengalaman kerja, pendidikan, sertifikasi, proyek, pencapaian, dan skill yang kamu isi.",
  "Lowongan dan lamaran: lowongan yang kamu simpan, draf surat lamaran dan CV hasil AI, status lamaran, serta riwayat persetujuan.",
  "Pengaturan agen: data pribadi untuk mengisi formulir lamaran, kriteria pencarian, dan preferensi kerja yang kamu isi sendiri.",
  "Antrean dan catatan kerja agen: tugas yang kamu serahkan ke agen dan jejak hasilnya.",
  "Asesmen Green Career: jawaban yang kamu tulis dan hasil penilaiannya.",
  "Sesi LinkedIn atau Gmail, hanya bila kamu sendiri menghubungkannya. Sesi disimpan terenkripsi di server.",
];

const SHARED_WITH = [
  "Supabase menyimpan database dan mengelola akun login.",
  "Penyedia model AI (OpenRouter dan Groq) menerima bagian profil dan deskripsi lowongan yang diperlukan untuk menulis draf lamaran atau menilai asesmen. Jangan menulis data yang tidak ingin kamu bagikan ke penyedia tersebut.",
  "Google, bila kamu memilih masuk dengan Google atau menghubungkan Gmail.",
  "Telegram: saat status lamaran berubah, server dapat mengirim pemberitahuan berisi judul lowongan dan nama perusahaan ke satu chat Telegram milik pengelola aplikasi, bukan ke akunmu. Ini hanya terjadi bila Telegram diatur di server.",
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-foreground/90">{children}</div>
    </section>
  );
}

function TermsPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <main className="mx-auto w-full max-w-2xl">
        <Link to="/" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Kembali ke beranda
        </Link>
        <h1 className="mt-4 text-3xl font-bold">Ketentuan &amp; Privasi</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ringkasan singkat, ditulis apa adanya. Halaman ini bukan dokumen hukum yang sudah ditinjau pengacara.
        </p>

        <Section title="Untuk apa Applify dipakai sekarang">
          <p>
            Applify adalah aplikasi yang sedang diuji sebagai bagian dari penelitian skripsi di Program Studi Sistem Informasi,
            Universitas Kristen Duta Wacana. Kamu memakainya sebagai peserta uji coba, bukan sebagai layanan komersial.
            Fitur bisa berubah atau gagal selama pengujian.
          </p>
        </Section>

        <Section title="Data apa yang disimpan">
          <ul className="list-disc space-y-1.5 pl-5">
            {DATA_STORED.map((d) => <li key={d}>{d}</li>)}
          </ul>
          <p>Kamu memutuskan sendiri apa yang diisi. Kolom yang kosong tidak diwajibkan, kecuali yang ditandai wajib di formulir.</p>
        </Section>

        <Section title="Siapa yang menerima data">
          <ul className="list-disc space-y-1.5 pl-5">
            {SHARED_WITH.map((d) => <li key={d}>{d}</li>)}
          </ul>
          <p>Kode aplikasi ini tidak punya fitur iklan maupun penjualan data.</p>
        </Section>

        <Section title="Data untuk penelitian skripsi">
          <p>
            Hasil pengujian, misalnya jawaban kuesioner atau catatan wawancara, dipakai untuk menilai kegunaan aplikasi dalam
            laporan skripsi.
          </p>
          <p>
            Cara data dilaporkan, lama penyimpanan, dan cara meminta data dihapus ditentukan peneliti:
            [MENUNGGU DATA: kebijakan pelaporan dan penyimpanan data penelitian]. Sampai ada keterangan resmi,
            hubungi peneliti lewat kontak di bawah.
          </p>
        </Section>

        <Section title="Hal yang perlu kamu tahu tentang agen">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Draf lamaran ditulis AI dan bisa salah. Baca dan sunting sebelum kamu menyetujuinya.</li>
            <li>Tidak ada lamaran yang dikirim sebelum kamu menyetujuinya di halaman Persetujuan.</li>
            <li>Kuota draf AI dihitung per bulan dan akan direset bulan depan.</li>
          </ul>
        </Section>

        <Section title="Kontak peneliti">
          <p>[MENUNGGU DATA: kontak peneliti]</p>
        </Section>
      </main>
    </div>
  );
}
