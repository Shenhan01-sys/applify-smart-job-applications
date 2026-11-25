/**
 * Menunggu sesi Supabase sesudah pengguna kembali dari OAuth atau tautan email.
 *
 * Token di alamat diproses Supabase secara asinkron. Membaca `getSession()` satu kali sesudah jeda tetap 1 detik gagal
 * di koneksi lambat ("sesimu tidak ditemukan"). Di sini sesi ditunggu lewat peristiwa `onAuthStateChange`
 * (SIGNED_IN, INITIAL_SESSION, TOKEN_REFRESHED) ditambah pembacaan berkala, sampai batas waktu. Berlangganan selalu
 * dilepas, juga saat dibatalkan.
 *
 * TypeScript murni tanpa impor Supabase, supaya bisa diuji langsung oleh `node --test`.
 */

export interface SessionLike {
  user?: { id?: string } | null;
}

export interface AuthClientLike<S extends SessionLike> {
  auth: {
    getSession(): Promise<{ data: { session: S | null }; error?: unknown }>;
    onAuthStateChange(cb: (event: string, session: S | null) => void): { data: { subscription: { unsubscribe(): void } } };
  };
}

export interface WaitForSessionOptions {
  /** Batas tunggu total (ms). Bawaan 9000. */
  timeoutMs?: number;
  /** Jarak pembacaan berkala `getSession()` (ms). Bawaan 400. */
  pollMs?: number;
  /** Batalkan penantian (komponen dilepas). Hasilnya `{ session: null, error: null, cancelled: true }`. */
  signal?: AbortSignal;
}

export interface WaitForSessionResult<S> {
  session: S | null;
  /** Galat dari `getSession()` bila ada. Penantian berhenti pada galat pertama. */
  error: unknown | null;
  cancelled: boolean;
}

const SESSION_EVENTS = new Set(["SIGNED_IN", "INITIAL_SESSION", "TOKEN_REFRESHED"]);

export function waitForSession<S extends SessionLike>(client: AuthClientLike<S>, opts: WaitForSessionOptions = {}): Promise<WaitForSessionResult<S>> {
  const timeoutMs = Math.max(0, opts.timeoutMs ?? 9000);
  const pollMs = Math.max(10, opts.pollMs ?? 400);
  return new Promise((resolve) => {
    let finished = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let deadline: ReturnType<typeof setTimeout> | null = null;
    let subscription: { unsubscribe(): void } | null = null;

    const finish = (result: WaitForSessionResult<S>) => {
      if (finished) return;
      finished = true;
      if (pollTimer) clearTimeout(pollTimer);
      if (deadline) clearTimeout(deadline);
      try {
        subscription?.unsubscribe();
      } catch {
        // Melepas langganan yang sudah lepas tidak boleh menggagalkan hasil.
      }
      resolve(result);
    };

    if (opts.signal?.aborted) return finish({ session: null, error: null, cancelled: true });
    opts.signal?.addEventListener("abort", () => finish({ session: null, error: null, cancelled: true }), { once: true });

    // Callback hanya mencatat sesi; tidak memanggil Supabase lagi di dalamnya (bisa saling mengunci).
    try {
      subscription = client.auth.onAuthStateChange((event, session) => {
        if (SESSION_EVENTS.has(event) && session?.user) finish({ session, error: null, cancelled: false });
      }).data.subscription;
      // Callback yang dipanggil sinkron sudah menyelesaikan sebelum langganan tersimpan: lepas sekarang.
      if (finished) subscription?.unsubscribe();
    } catch {
      subscription = null;
    }
    if (finished) return;

    const poll = async () => {
      if (finished) return;
      try {
        const { data, error } = await client.auth.getSession();
        if (finished) return;
        if (error) return finish({ session: null, error, cancelled: false });
        if (data?.session?.user) return finish({ session: data.session, error: null, cancelled: false });
      } catch (err) {
        if (!finished) return finish({ session: null, error: err, cancelled: false });
        return;
      }
      if (!finished) pollTimer = setTimeout(poll, pollMs);
    };

    deadline = setTimeout(() => finish({ session: null, error: null, cancelled: false }), timeoutMs);
    void poll();
  });
}
