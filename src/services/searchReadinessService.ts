import { supabase } from "@/lib/supabase";
import { automationApi } from "@/services/automationApi";
import { searchInputMissing } from "@/lib/searchReadiness";

const isMockMode = () => import.meta.env.VITE_MOCK_MODE === "true";

/**
 * Pencarian belum punya bahan (tanpa kata kunci tersimpan dan tanpa jabatan di profil)? Dibaca dengan sesi
 * pengguna sendiri. Best effort: bila salah satu sumber tidak terbaca, jawabannya false (petunjuk tidak muncul)
 * dan pencarian tetap dicoba; backend yang memutuskan.
 */
export async function loadSearchInputMissing(): Promise<boolean> {
  if (isMockMode()) return false;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const [settings, profile] = await Promise.all([
      automationApi.getSettings(),
      supabase.from("profiles").select("current_title").eq("id", user.id).maybeSingle(),
    ]);
    if (profile.error) return false;
    return searchInputMissing({
      searchKeywords: settings?.search_keywords,
      currentTitle: (profile.data as { current_title?: string | null } | null)?.current_title,
    });
  } catch {
    return false;
  }
}
