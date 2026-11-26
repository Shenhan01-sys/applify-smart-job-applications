import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MOBILE_TAB_ITEMS, NAV_GROUPS, NAV_ITEMS, isActivePath } from "../src/lib/navItems.ts";
import { planFromRow } from "../src/lib/subscriptionStore.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("menu: Profil ada di menu penuh dan bilah ponsel; Persetujuan terjangkau satu ketukan di ponsel", () => {
  assert.ok(NAV_ITEMS.some((i) => i.to === "/profile"));
  assert.ok(MOBILE_TAB_ITEMS.some((i) => i.to === "/profile"));
  assert.ok(MOBILE_TAB_ITEMS.some((i) => i.to === "/approvals"));
  assert.equal(MOBILE_TAB_ITEMS.length, 5);
});

test("menu: label Indonesia, tanpa LinkedIn, langganan, atau pembayaran di menu utama", () => {
  const labels = NAV_ITEMS.map((i) => i.label).join(" | ");
  for (const english of ["Dashboard", "Job Feed", "Applications", "Approvals", "Automation", "Skill Radar", "Blind Merit Mode", "Green Career", "Settings", "Logout"]) {
    assert.ok(!labels.includes(english), `label Inggris masih ada: ${english}`);
  }
  const targets = [...NAV_ITEMS, ...MOBILE_TAB_ITEMS].map((i) => i.to as string);
  for (const hidden of ["/linkedin-session", "/subscription", "/payment", "/payment/success"]) assert.ok(!targets.includes(hidden));
});

test("halaman aktif mengenali anak rute tetapi bukan awalan yang kebetulan sama", () => {
  assert.equal(isActivePath("/profile", "/profile"), true);
  assert.equal(isActivePath("/payment/success", "/payment"), true);
  assert.equal(isActivePath("/profile-lama", "/profile"), false);
});

test("AppShell: tanpa teks tertulis tetap (Free Member, 7 platform) atau sakelar agen palsu; lonceng memakai pusat notifikasi nyata", () => {
  const src = read("../src/components/app/AppShell.tsx");
  assert.doesNotMatch(src, /Free Member|7 platform|v1\.0\.0|feedback/);
  assert.match(src, /InAppNotificationsBell/);
  assert.doesNotMatch(src, /AgentToggle|agentOn/);
  assert.match(src, /@\/components\/ui\/sheet/);
  assert.match(src, /aria-label="Buka menu"/);
});

test("langganan dan pembayaran: rute tertutup kecuali VITE_ENABLE_BILLING, tidak ada tautan UI ke sana", () => {
  for (const f of ["subscription.tsx", "payment.tsx", "payment.success.tsx"]) {
    assert.match(read(`../src/routes/${f}`), /if \(!isBillingEnabled\(\)\) throw redirect\(\{ to: "\/dashboard" \}\)/, f);
  }
  const sources: Record<string, string> = {
    settings: read("../src/routes/settings.tsx"),
    automation: read("../src/routes/automation-settings.tsx"),
    modal: read("../src/components/AIApplyModal.tsx"),
    shell: read("../src/components/app/AppShell.tsx"),
  };
  for (const [name, src] of Object.entries(sources)) {
    const linksToBilling = [...src.matchAll(/to="\/(subscription|payment)[^"]*"/g)];
    // Landing (index.tsx) dikecualikan: desain asli dipertahankan atas keputusan Hans (2026-11-19). Tautan
    // ke /subscription di sana tetap aman karena rutenya mengarah ke /dashboard selama billing mati.
    if (name === "settings") {
      // boleh hanya di dalam cabang yang dijaga isBillingEnabled()
      assert.match(src, /isBillingEnabled/, `${name} harus menjaga tautan tagihan dengan isBillingEnabled`);
    } else {
      assert.equal(linksToBilling.length, 0, `${name} masih menautkan ke langganan/pembayaran`);
    }
  }
  assert.doesNotMatch(sources.automation, /Upgrade ke Pro/);
});

test("paket dan kuota dibaca dari database, bukan localStorage", () => {
  const hook = read("../src/hooks/useSubscription.ts");
  assert.match(hook, /from\("subscriptions"\)/);
  assert.match(hook, /rpc\("get_quota_status"/);
  assert.doesNotMatch(hook, /localStorage/);
  const settings = read("../src/routes/settings.tsx");
  assert.match(settings, /@\/hooks\/useSubscription/);
  assert.doesNotMatch(settings, /localStorage|useSimulatedCheckout/);
  assert.equal(planFromRow(null), "free");
  assert.equal(planFromRow({ ai_model_tier: "pro" }), "pro");
  assert.equal(planFromRow({ ai_model_tier: "free", plan_name: "kampus" }), "kampus");
  assert.equal(planFromRow({ ai_model_tier: "weird" }), "free");
});

test("fitur tanpa handler berlabel Segera hadir di Pengaturan, bukan tombol yang diam", () => {
  const src = read("../src/routes/settings.tsx");
  assert.match(src, /Segera hadir/);
  assert.doesNotMatch(src, /Install untuk Chrome|Riwayat Tagihan|Golden Window/);
  // Sesi LinkedIn disembunyikan (23 Nov 2026): tidak ada tautan dari Pengaturan, dan rutenya dialihkan.
  assert.doesNotMatch(src, /to="\/linkedin-session"/);
  assert.match(read("../src/routes/linkedin-session.tsx"), /throw redirect\(\{ to: "\/settings" \}\)/);
});

test("UX Wave 3: navigasi terkelompok ke /dashboard, profil cegah tutup editor terbuka, LLM keys terlipat, AI tab tanpa tombol simpan", () => {
  assert.deepEqual(
    NAV_GROUPS.flatMap((g) => g.items).sort(),
    NAV_ITEMS.map((i) => i.to).sort(),
  );
  const shell = read("../src/components/app/AppShell.tsx");
  assert.doesNotMatch(shell, /<Link to="\/"\s+className=/);
  assert.match(shell, /<Link to="\/dashboard" className="flex items-center/);
  assert.match(shell, /<AgentNote onNavigate=\{\(\) => setMenuOpen\(false\)\} \/>/);
  assert.match(shell, /Pratinjau/);

  const profile = read("../src/routes/profile.tsx");
  assert.match(profile, /hasOpenEditor/);
  assert.match(profile, /step < steps\.length && \(/);
  assert.match(profile, /formData\[field\.key\] \?\? ''/);

  const llm = read("../src/components/LlmKeysCard.tsx");
  assert.match(llm, /<details open=\{keys\.length > 0\}/);

  const auto = read("../src/routes/automation-settings.tsx");
  assert.match(auto, /activeTab === 'ai' \?/);
  assert.match(auto, /to="\/profile"/);
});
