import type { AutomationSettings } from "@/services/automationApi";

export interface ProfileIdentityRow {
  full_name?: unknown;
  phone?: unknown;
  location?: unknown;
  linkedin_url?: unknown;
  portfolio_url?: unknown;
}

const cleanText = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const isBlank = (v: unknown): boolean => typeof v !== "string" || v.trim().length === 0;

/** Ambil nama kota dari teks lokasi (segmen pertama sebelum koma), tanpa menebak negara. */
function cityFromLocation(location: unknown): string {
  const raw = cleanText(location);
  if (!raw) return "";
  const first = raw.split(",")[0]?.trim() ?? "";
  return first;
}

/**
 * E2E-06: Lengkapi kolom identitas yang kosong di Pengaturan Agen dari baris Profil Saya (`/profile`).
 * Kolom yang sudah diisi di Pengaturan Agen selalu menang, dan kolom numerik gaji/notice period tidak disentuh.
 */
export function mergeIdentityFromProfile(
  settings: AutomationSettings | null | undefined,
  profile: ProfileIdentityRow | null | undefined,
): { settings: AutomationSettings; syncedFields: string[] } {
  const base: AutomationSettings = { ...(settings ?? {}) };
  if (!profile) return { settings: base, syncedFields: [] };

  const syncedFields: string[] = [];
  const fullName = cleanText(profile.full_name).replace(/\s+/g, " ");
  if (fullName && isBlank(base.first_name) && isBlank(base.last_name)) {
    const [first, ...rest] = fullName.split(" ");
    if (first) {
      base.first_name = first;
      syncedFields.push("first_name");
    }
    if (rest.length > 0) {
      base.last_name = rest.join(" ");
      syncedFields.push("last_name");
    }
  }

  const pairs: Array<[keyof AutomationSettings, unknown]> = [
    ["phone_number", profile.phone],
    ["current_city", cityFromLocation(profile.location)],
    ["linkedin_url", profile.linkedin_url],
    ["website", profile.portfolio_url],
  ];
  for (const [key, raw] of pairs) {
    const val = cleanText(raw);
    if (val && isBlank(base[key])) {
      (base as Record<string, unknown>)[key] = val;
      syncedFields.push(String(key));
    }
  }

  return { settings: base, syncedFields };
}
