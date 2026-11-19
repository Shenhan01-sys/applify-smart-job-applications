// Supabase mengirim event auth (TOKEN_REFRESHED, SIGNED_IN saat tab kembali difokuskan) dengan objek user baru
// walaupun penggunanya sama. Halaman yang memuat data dengan efek bergantung pada `user` (misalnya Profil) lalu
// memuat ulang dari database dan menimpa isian form yang belum disimpan. Fungsi ini mempertahankan objek lama
// selama id dan waktu pembaruan akun sama, sehingga referensi `user` hanya berubah bila akunnya memang berubah.

export interface UserLike {
  id: string;
  updated_at?: string;
}

export function keepUserIfUnchanged<T extends UserLike>(prev: T | null, next: T | null): T | null {
  if (prev && next && prev.id === next.id && prev.updated_at === next.updated_at) return prev;
  return next;
}
