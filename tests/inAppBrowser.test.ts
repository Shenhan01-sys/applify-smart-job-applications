import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { detectInAppBrowser, inAppBrowserWarning } from "../src/lib/inAppBrowser.ts";

test("peramban bawaan aplikasi terdeteksi; peramban biasa tidak", () => {
  const cases: Array<[string, string | null]> = [
    ["Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A; wv) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36 WhatsApp/2.24.1", "WhatsApp"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 310.0.0", "Instagram"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) Mobile/15E148 [FBAN/FBIOS;FBAV/440.0]", "Facebook"],
    ["Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit/537.36 Chrome/119.0 Mobile Safari/537.36", "WebView"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36", null],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 Version/17.1 Mobile/15E148 Safari/604.1", null],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36", null],
  ];
  for (const [ua, want] of cases) assert.equal(detectInAppBrowser(ua), want, ua);
  assert.equal(detectInAppBrowser(undefined), null);
});

test("peringatan menyebut Chrome, Safari, dan jalan keluar email; halaman masuk memasangnya di atas tombol Google", () => {
  const text = inAppBrowserWarning("WhatsApp");
  assert.match(text, /WhatsApp/);
  assert.match(text, /Chrome/);
  assert.match(text, /Safari/);
  assert.match(text, /email/);
  assert.doesNotMatch(text, /\u2014/);
  const src = readFileSync(new URL("../src/routes/login.tsx", import.meta.url), "utf8");
  assert.ok(src.indexOf("inAppBrowserWarning(inApp)") < src.indexOf("{/* Google OAuth Button */}"));
});
