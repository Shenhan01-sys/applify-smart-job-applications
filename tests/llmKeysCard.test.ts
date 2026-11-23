import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LLM_PROVIDER_IDS } from "../src/lib/llmKeys.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const card = read("../src/components/LlmKeysCard.tsx");
const lib = read("../src/lib/llmKeys.ts");
const mock = read("../src/mocks/llmKeysMock.ts");
const settings = read("../src/routes/settings.tsx");
const api = read("../src/services/automationApi.ts");

/** Bagian automationApi.ts yang menangani kunci LLM (dari penanda sampai akhir berkas). */
const apiKeysBlock = api.slice(api.indexOf("// Kunci API LLM milik pengguna (BYOK)"));
/** Isi fungsi submit di komponen (dari "async function submit" sampai fungsi berikutnya). */
const submit = card.slice(card.indexOf("async function submit"), card.indexOf("async function retest"));

test("kolom kunci: type=password, autoComplete=new-password (peramban mengabaikan off pada password), spellCheck mati, pengelola kata sandi diminta tidak ikut", () => {
  assert.match(card, /type="password"\s*autoComplete="new-password"/);
  assert.match(card, /spellCheck=\{false\}/);
  assert.match(card, /autoCapitalize="none"/);
  assert.match(card, /data-1p-ignore/);
  assert.match(card, /data-lpignore/);
  // tepat satu kolom rahasia; selain itu hanya kolom model (teks biasa) dan kotak centang persetujuan
  assert.equal((card.match(/type="password"/g) ?? []).length, 1);
  assert.equal((card.match(/type="text"/g) ?? []).length, 1);
  assert.equal((card.match(/type="checkbox"/g) ?? []).length, 1);
  assert.equal((card.match(/<input\b/g) ?? []).length, 3);
});

test("kolom, label, dan tombol punya tinggi sentuh 44px", () => {
  assert.match(card, /<label htmlFor=\{inputId\}/);
  assert.match(card, /<label htmlFor=\{modelId\}/);
  assert.match(card, /className=\{`\$\{INPUT_CLASS\} min-h-11`\}/);
  for (const name of ["PRIMARY_BUTTON", "SECONDARY_BUTTON", "DANGER_BUTTON"]) {
    const m = card.match(new RegExp(`const ${name} =\\s*"([^"]+)"`));
    assert.ok(m, name);
    assert.match(m[1], /min-h-11/, name);
  }
  assert.match(card, /<label htmlFor=\{`\$\{uid\}-consent`\} className="mt-3 flex min-h-11/, "seluruh baris persetujuan bisa disentuh");
  assert.doesNotMatch(card, /text-\[(8|9|10|11)px\]/);
});

test("kartu tidak memakai penyimpanan browser, console, cookie, alamat halaman, atau toast", () => {
  for (const [name, src] of [["LlmKeysCard.tsx", card], ["llmKeys.ts", lib], ["llmKeysMock.ts", mock], ["blok API kunci", apiKeysBlock]] as const) {
    assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB/, name);
    assert.doesNotMatch(src, /\bconsole\.(log|info|warn|error|debug|trace|table|dir)\b/, name);
    assert.doesNotMatch(src, /document\.cookie/, name);
    assert.doesNotMatch(src, /location\.(search|hash|href)|history\.(push|replace)State|navigate\(/, name);
    assert.doesNotMatch(src, /toast/i, name);
    assert.doesNotMatch(src, /navigator\.clipboard/, name);
  }
});

test("kolom kunci dikosongkan segera sesudah tombol ditekan, sebelum permintaan, apa pun hasilnya", () => {
  const clear = submit.indexOf('setValue("")');
  const precheck = submit.indexOf("precheckLlmKey(");
  const request = submit.indexOf("automationApi.saveLlmKey(");
  assert.ok(clear > 0 && precheck > 0 && request > 0, "ketiganya ada");
  assert.ok(clear < precheck, "dikosongkan sebelum pemeriksaan bentuk, jadi juga saat pemeriksaan gagal");
  assert.ok(clear < request, "dikosongkan sebelum permintaan dikirim, jadi juga saat permintaan gagal");
  assert.equal((submit.match(/setValue\(/g) ?? []).length, 1, "satu-satunya setValue di submit adalah pengosongan");
  // Tidak ada jalur yang mengisi kolom lagi dengan kunci yang baru dikirim.
  assert.doesNotMatch(card, /setValue\((typed|check|saved)/);
});

test("kunci tidak pernah ditampilkan sebagai teks: tidak di pesan, tidak di JSX, tidak di atribut selain value kolom", () => {
  assert.doesNotMatch(card, /\{typed\}|\{check\.key\}/);
  assert.doesNotMatch(card, /text:\s*[^,}]*\b(typed|check\.key|value)\b/, "teks pemberitahuan tidak memuat kunci");
  assert.doesNotMatch(card, /title=\{(typed|value|check)/);
  assert.match(card, /value=\{value\}/, "isi kolom hanya lewat atribut value dari kolom kunci");
  // yang ditampilkan dari kunci tersimpan hanya hasil maskLast4
  assert.match(card, /maskLast4\(row\.last4\)/);
});

test("persetujuan: kotak centang kosong bawaannya, dan tidak ada jalur yang mencentangnya selain pengguna", () => {
  assert.match(card, /const \[consent, setConsent\] = useState\(false\)/);
  assert.match(card, /type="checkbox"\s+checked=\{consent\}/);
  assert.match(card, /onChange=\{\(e\) => setConsent\(e\.target\.checked\)\}/);
  assert.doesNotMatch(card, /defaultChecked|useState\(true\)|setConsent\(true\)|checked=\{true\}|checked\s*$/m);
  // satu-satunya yang mengubah persetujuan: centang pengguna dan pengosongan sesudah kirim
  const setters = card.match(/setConsent\([^)]*\)/g) ?? [];
  assert.deepEqual([...setters].sort(), ["setConsent(e.target.checked)", "setConsent(false)"].sort());
});

test("persetujuan: tombol Simpan mati sampai dicentang, dan kirim juga ditahan di submit", () => {
  assert.match(card, /const canSave = canSaveLlmKey\(\{ usable, consent, key: value, requiresModel, model \}\);/);
  assert.match(card, /disabled=\{working \|\| !canSave\}/);
  // submit (Enter di kolom) tidak boleh melewati gerbang yang sama dengan tombol
  const guard = submit.indexOf("if (working || !canSave) return;");
  assert.ok(guard > 0, "submit memeriksa canSave");
  assert.ok(guard < submit.indexOf('setValue("")'), "gerbang sebelum apa pun dilakukan");
  assert.ok(guard < submit.indexOf("automationApi.saveLlmKey("), "gerbang sebelum permintaan");
  // satu-satunya penentu tombol dan submit adalah canSave (tidak ada syarat lain yang bisa menyimpang)
  assert.equal((card.match(/canSaveLlmKey\(/g) ?? []).length, 1);
});

test("persetujuan berlaku untuk satu penyimpanan: dikosongkan lagi sebelum permintaan, apa pun hasilnya", () => {
  const reset = submit.indexOf("setConsent(false)");
  assert.ok(reset > 0, "persetujuan di-reset di submit");
  assert.ok(reset < submit.indexOf("precheckLlmKey("), "reset sebelum pemeriksaan, jadi juga saat pemeriksaan gagal");
  assert.ok(reset < submit.indexOf("automationApi.saveLlmKey("), "reset sebelum permintaan, jadi juga saat permintaan gagal");
  assert.equal((submit.match(/setConsent\(/g) ?? []).length, 1);
});

test("persetujuan: teks menyebut penyedia pilihan, dan permintaan membawa consent: true", () => {
  assert.match(card, /<span>\{llmConsentText\(info\.label\)\}<\/span>/);
  assert.match(lib, /Data CV dan profilku akan dikirim ke \$\{label\} \(bisa di luar negeri\)/);
  assert.match(lib, /tagihan dari \$\{label\} kutanggung sendiri/);
  assert.match(submit, /automationApi\.saveLlmKey\(provider, check\.key, \{ consent: true, model: modelCheck\.model \}\)/);
  assert.match(apiKeysBlock, /options: \{ consent: true; model\?: string \| null \}/, "tipe memaksa consent: true");
  assert.match(apiKeysBlock, /JSON\.stringify\(\{ apiKey, consent: options\.consent, model \}\)/);
  assert.doesNotMatch(card, /consent:\s*(false|consent)/);
});

test("model: kolom teks dibatasi 100 karakter, diperiksa sebelum kirim, dan hanya ikut lewat PUT", () => {
  assert.match(card, /maxLength=\{MODEL_MAX_LENGTH\}/);
  assert.match(card, /precheckLlmModel\(model, \{ required: requiresModel \}\)/);
  assert.match(apiKeysBlock, /const model = options\.model \|\| undefined/);
  // model tidak masuk alamat
  assert.doesNotMatch(apiKeysBlock, /\?model=|\$\{model\}/);
});

test("model wajib: label, petunjuk, aria-required, dan gerbang Simpan mengikuti requiresModel di registri", () => {
  assert.match(card, /const requiresModel = info\.requiresModel === true;/);
  assert.match(card, /\{llmModelLabel\(requiresModel\)\}/);
  assert.doesNotMatch(card, /Model \(opsional\)|Model \(wajib\)/, "teks label hanya dari llmModelLabel");
  assert.match(card, /aria-required=\{requiresModel\}/);
  assert.match(card, /\{requiresModel \? LLM_MODEL_REQUIRED_HINT : LLM_MODEL_HINT\}/);
  // gerbang Simpan memakai model dan requiresModel; submit juga memeriksa ulang dengan required
  assert.match(card, /canSaveLlmKey\(\{ usable, consent, key: value, requiresModel, model \}\)/);
  assert.match(submit, /precheckLlmModel\(model, \{ required: requiresModel \}\)/);
  // komponen tidak menyebut penyedia tertentu: wajib atau tidak hanya dari registri
  assert.doesNotMatch(card, /needsModel/);
  assert.match(lib, /requiresModel\?: boolean/);
  assert.match(lib, /case "model_required":/);
});

test("alamat tujuan tidak pernah input pengguna: UI tidak membaca baseUrl atau alamat uji dari registri", () => {
  for (const [name, src] of [["LlmKeysCard.tsx", card], ["blok API kunci", apiKeysBlock], ["llmKeysMock.ts", mock]] as const) {
    assert.doesNotMatch(src, /baseUrl|validate\.url|\.validate\b/, name);
    assert.doesNotMatch(src, /fetch\(/, `${name}: tidak memanggil penyedia langsung dari browser`);
  }
  assert.doesNotMatch(card, /type="url"|name="baseUrl"|placeholder="https?:/i);
});

test("daftar penyedia hanya dari registri: komponen, API, mock, dan settings tidak menulis id penyedia", () => {
  for (const [name, src] of [["LlmKeysCard.tsx", card], ["blok API kunci", apiKeysBlock], ["llmKeysMock.ts", mock], ["settings.tsx", settings]] as const) {
    for (const id of LLM_PROVIDER_IDS) {
      assert.doesNotMatch(src, new RegExp(`["'\`]${id}["'\`]`), `${name} menulis id ${id}`);
    }
  }
  assert.match(card, /visibleProviders\(data\.providers\)/);
  assert.match(mock, /\[\.\.\.LLM_PROVIDER_IDS\]/);
});

test("penyedia yang belum diperiksa tampil mati: lencana Segera hadir, tanpa kolom kunci, centang, atau simpan", () => {
  assert.match(card, /const usable = enabled && info\.verified/);
  assert.match(card, /info\.verified \|\| row \? <StatusBadge view=\{view\} \/> : <SoonBadge \/>/);
  assert.match(card, /LLM_PROVIDER_SOON_LABEL/);
  assert.match(card, /LLM_PROVIDER_SOON_TEXT/);
  assert.match(card, /const showForm = info\.verified \|\| row !== null/);
  // kolom kunci, model, centang, dan tombol simpan semuanya di dalam cabang info.verified
  const form = card.slice(card.indexOf("{showForm && ("));
  const verifiedBlock = form.indexOf("{info.verified && (");
  assert.ok(verifiedBlock > 0);
  for (const marker of ['type="password"', 'type="checkbox"', 'type="text"', "Simpan dan uji"]) {
    assert.ok(form.indexOf(marker) > verifiedBlock, `${marker} hanya untuk penyedia verified`);
  }
  // membukanya hanya perubahan data di registri
  assert.match(lib, /`verified: false` = penyedia belum diperiksa/);
  assert.match(lib, /tanpa mengubah komponen/);
  assert.match(lib, /Urutan tampil: OpenAI dan Anthropic dulu/);
});

test("kunci dikirim hanya lewat badan PUT: tidak di alamat, tidak di kepala, tidak di GET", () => {
  const save = apiKeysBlock.slice(apiKeysBlock.indexOf("async saveLlmKey"), apiKeysBlock.indexOf("async testLlmKey"));
  assert.match(save, /method: 'PUT'/);
  assert.match(save, /\/api\/llm-keys\/\$\{encodeURIComponent\(provider\)\}`/);
  assert.doesNotMatch(save, /\?apiKey|\$\{apiKey\}|headers:\s*\{[^}]*apiKey/);
  // satu-satunya tempat apiKey masuk ke permintaan
  assert.equal((apiKeysBlock.match(/JSON\.stringify\(\{ apiKey,/g) ?? []).length, 1);
  const listStart = apiKeysBlock.indexOf("async getLlmKeys");
  const list = apiKeysBlock.slice(listStart, apiKeysBlock.indexOf("  /**", listStart)); // sampai komentar fungsi berikutnya
  assert.match(list, /\/api\/llm-keys`/);
  assert.doesNotMatch(list, /apiKey/);
});

test("API: daftar, simpan, uji, hapus ke rute kontrak, dengan fallback mode demo", () => {
  assert.match(apiKeysBlock, /async getLlmKeys\(\)/);
  assert.match(apiKeysBlock, /async saveLlmKey\(/);
  assert.match(apiKeysBlock, /async testLlmKey\(provider: LlmProvider\)/);
  assert.match(apiKeysBlock, /async deleteLlmKey\(provider: LlmProvider\)/);
  assert.match(apiKeysBlock, /\/api\/llm-keys\/\$\{encodeURIComponent\(provider\)\}\/test`/);
  assert.match(apiKeysBlock, /method: 'DELETE'/);
  assert.match(apiKeysBlock, /method: 'POST'[^\n]*body: '\{\}'/);
  // semua lewat apiFetch dengan fungsi contoh, sehingga di luar mode demo galat dilempar dan tidak diganti data palsu
  assert.equal((apiKeysBlock.match(/apiFetch<unknown>\(/g) ?? []).length, 4);
  assert.match(api, /from '@\/mocks\/llmKeysMock'/);
  // mode demo juga menolak penyedia yang belum diperiksa, seperti server (400 provider_unverified)
  assert.match(apiKeysBlock, /if \(!info\.verified\) throw new ApiError\(400, JSON\.stringify\(\{ code: 'provider_unverified' \}\)\)/);
  assert.match(apiKeysBlock, /if \(info\.requiresModel && !model\) throw new ApiError\(400, JSON\.stringify\(\{ code: 'model_required' \}\)\)/);
  // galat dari server dilempar apa adanya ke komponen; tidak ditelan
  assert.doesNotMatch(apiKeysBlock, /catch\s*\{|catch \(/);
});

test("mock tidak menyimpan kunci utuh", () => {
  assert.match(mock, /last4: apiKey\.trim\(\)\.slice\(-4\)/);
  assert.doesNotMatch(mock, /key:\s*apiKey/);
  assert.match(api, /let mockLlmKeyRows: LlmKeyRow\[\] = \[\]/);
});

test("tiga tombol per penyedia dengan teks yang diminta, dan hapus meminta konfirmasi", () => {
  assert.match(card, /Simpan dan uji/);
  assert.match(card, /Uji ulang/);
  assert.match(card, /Hapus/);
  assert.match(card, /Ya, hapus/);
  assert.match(card, /Batal/);
  // tombol Hapus di baris hanya membuka konfirmasi; penghapusan hanya dari tombol "Ya, hapus"
  assert.equal((card.match(/automationApi\.deleteLlmKey\(/g) ?? []).length, 1);
  assert.match(card, /onClick=\{remove\}[^>]*>\s*\{busy === "delete"/);
  assert.doesNotMatch(card, /onClick=\{\(\) => remove\(/);
});

test("status dan tanggal: label status, 4 karakter terakhir bertopeng, tanggal diperiksa terakhir, model", () => {
  assert.match(card, /LLM_KEY_STATUS_LABEL\[view\]/);
  assert.match(card, /maskLast4\(row\.last4\)/);
  assert.match(card, /formatKeyDate\(row\.lastValidatedAt\)/);
  assert.match(card, /terakhir diperiksa/);
  assert.match(card, /row\.model && /);
  // status tidak hanya warna: ikon dan teks
  assert.match(card, /<Icon className="h-3\.5 w-3\.5" aria-hidden="true" \/> \{LLM_KEY_STATUS_LABEL\[view\]\}/);
});

test("fitur mati: pemberitahuan tampil, kolom dan simpan dimatikan, tetapi Hapus tetap bisa", () => {
  assert.match(card, /!enabled && \(/);
  assert.match(card, /LLM_KEYS_DISABLED_TEXT/);
  assert.match(card, /LLM_KEYS_DISABLED_DELETE_TEXT/);
  assert.match(card, /disabled=\{working \|\| !usable\}/, "kolom dan centang mati bila fitur mati atau penyedia belum diperiksa");
  const retest = card.slice(card.indexOf("async function retest"), card.indexOf("async function remove"));
  assert.match(retest, /!usable/, "uji ulang butuh fitur aktif");
  const remove = card.slice(card.indexOf("async function remove"), card.indexOf("return (\n    <li"));
  assert.doesNotMatch(remove, /enabled|usable/, "hapus tidak bergantung pada fitur aktif");
  assert.match(card, /onClick=\{\(\) => \{ setConfirming\(true\); setNotice\(null\); \}\}\s*disabled=\{working\}/);
});

test("catatan kuota, enkripsi, dan 4 karakter terakhir tampil di kartu", () => {
  assert.match(card, /LLM_KEYS_STORAGE_NOTE/);
  assert.match(card, /LLM_KEYS_QUOTA_NOTE/);
  assert.match(lib, /terenkripsi/);
  assert.match(lib, /tidak dihitung ke kuota draf bulanan, tetapi tetap dibatasi laju/);
  assert.match(lib, /hanya 4 karakter terakhir yang ditampilkan/);
});

test("pesan galat dari kode backend, bukan teks mentah; pemberitahuan dibacakan pembaca layar", () => {
  assert.match(card, /describeLlmKeyApiError\(err\)/);
  assert.doesNotMatch(card, /err\.message|\(err as/);
  assert.match(card, /role=\{notice\.tone === "error" \? "alert" : "status"\}/);
  assert.match(card, /describeTestResult\(res\.result\)/);
  assert.match(lib, /case "provider_unverified":/);
  assert.match(lib, /case "consent_required":/);
});

test("tautan ke halaman pembuat kunci terbuka di tab baru tanpa referrer opener, dan hanya bila alamatnya ada", () => {
  assert.match(card, /href=\{info\.keyUrl\}/);
  assert.match(card, /\{info\.keyUrl && \(/);
  assert.match(card, /target="_blank"/);
  assert.match(card, /rel="noopener noreferrer"/);
  assert.match(card, /\(buka di tab baru\)/);
});

test("daftar kunci diperbarui dengan pembaruan fungsional dan memuat ulang bila gagal", () => {
  assert.match(card, /setData\(\(d\) => \(d \? \{ \.\.\.d, keys: update\(d\.keys\) \} : d\)\)/);
  assert.match(card, /automationApi\s*\.getLlmKeys\(\)/);
  assert.match(card, /Coba lagi/);
  assert.match(card, /Memuat kunci\.\.\./);
});

test("settings.tsx menampilkan kartu Kunci API Sendiri (BYOK) dengan LlmKeysCard", () => {
  assert.match(settings, /import LlmKeysCard from "@\/components\/LlmKeysCard";/);
  assert.match(settings, /title="Kunci API Sendiri \(BYOK\)"/);
  const at = settings.indexOf('title="Kunci API Sendiri (BYOK)"');
  const close = settings.indexOf("</Card>", at);
  assert.ok(at > 0 && close > at);
  assert.match(settings.slice(at, close), /<LlmKeysCard \/>/);
  assert.match(settings, /KeyRound/);
});
