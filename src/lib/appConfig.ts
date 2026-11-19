/**
 * Konfigurasi build yang dibaca dari variabel lingkungan Vite.
 *
 * Fungsi murni (`resolveApiBaseUrl`, `flagOn`) menerima objek `env` supaya bisa dites dengan `node --test`,
 * yang tidak punya `import.meta.env`. Pembungkus di bawahnya membaca `import.meta.env` saat dipanggil,
 * bukan saat modul dimuat.
 */

export interface AppEnv {
  VITE_API_URL?: string;
  VITE_MOCK_MODE?: string;
  VITE_ENABLE_BILLING?: string;
  /** true hanya pada `vite dev`; false pada build produksi */
  DEV?: boolean;
}

/** Alamat server otomasi bawaan, hanya dipakai saat pengembangan lokal. */
export const DEV_API_URL = "http://localhost:4000";

/** Dilempar saat build produksi tidak punya VITE_API_URL. Pesannya dibaca pengguna, jadi berbahasa Indonesia. */
export class ApiConfigError extends Error {
  code = "api_not_configured";
  constructor() {
    super(
      "Alamat server Applify belum diatur pada versi aplikasi ini (VITE_API_URL kosong), jadi fitur yang butuh server tidak bisa dipakai. " +
        "Ini masalah konfigurasi, bukan kesalahanmu. Hubungi pengelola aplikasi.",
    );
    this.name = "ApiConfigError";
  }
}

export const flagOn = (value: string | undefined): boolean => value === "true";

/**
 * Alamat dasar server otomasi. VITE_API_URL yang diisi selalu menang. Tanpa itu, localhost:4000 hanya
 * dipakai saat `vite dev`; di build produksi hasilnya null supaya pemanggil menampilkan galat konfigurasi
 * dan tidak diam-diam memanggil komputer pengguna.
 */
export function resolveApiBaseUrl(env: AppEnv): string | null {
  const fromEnv = env.VITE_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  if (env.DEV) return DEV_API_URL;
  return null;
}

function readEnv(): AppEnv {
  // `import.meta.env` tidak ada di Node (tes), jadi dijaga agar modul tetap bisa diimpor di sana.
  return ((import.meta as unknown as { env?: AppEnv }).env ?? {}) as AppEnv;
}

export const isMockMode = (): boolean => flagOn(readEnv().VITE_MOCK_MODE);

/** Langganan dan pembayaran disembunyikan kecuali VITE_ENABLE_BILLING bernilai "true". */
export const isBillingEnabled = (): boolean => flagOn(readEnv().VITE_ENABLE_BILLING);

/** Alamat dasar server otomasi, atau lempar ApiConfigError bila build produksi tidak mengaturnya. */
export function getApiBaseUrl(): string {
  const url = resolveApiBaseUrl(readEnv());
  if (!url) throw new ApiConfigError();
  return url;
}
