/**
 * Ringkasan status daftar lowongan Karier Hijau untuk tampilan UI.
 * Daftar di halaman /green-career sengaja disaring ketat oleh hasGreenEvidence (judul/deskripsi wajib
 * memuat bukti topik lingkungan/EBT), sehingga jumlahnya sedikit tetapi terverifikasi. Pesan ini membantu
 * peserta UAT memahami bahwa daftar yang sedikit memang disengaja dan asesmen tidak mengirim lamaran.
 */
export interface GreenCareerListNotice {
  title: string;
  body: string;
}

export function greenCareerListNotice(count: number): GreenCareerListNotice {
  if (count <= 0) {
    return {
      title: "Belum ada lowongan karier hijau terverifikasi saat ini",
      body: "Halaman ini hanya menampilkan lowongan yang judul atau deskripsinya secara eksplisit memuat topik lingkungan, energi terbarukan, atau keberlanjutan. Kamu bisa memuat ulang daftar atau mencari lowongan lain di halaman Lowongan.",
    };
  }
  return {
    title: `Menampilkan ${count} lowongan karier hijau terverifikasi`,
    body: "Hanya lowongan yang secara eksplisit memuat topik lingkungan, energi terbarukan, atau keberlanjutan di judul atau deskripsinya yang ditampilkan di sini. Pilih salah satu kartu lalu tekan Ikuti Asesmen untuk menilai kesiapanmu — asesmen ini tidak mengirim lamaran.",
  };
}
