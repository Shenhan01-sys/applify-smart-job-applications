import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";
import { API_URL, APP_PORT, APP_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from "./tests/e2e/helpers/constants";

/**
 * Smoke tests untuk halaman Persetujuan dan Lamaran Saya. Backend dan Supabase dipalsukan seluruhnya lewat
 * page.route (tests/e2e/helpers): tidak ada lalu lintas ke luar 127.0.0.1.
 *
 * Playwright 1.60 mencari Chromium revisi 1223 yang tidak terpasang di mesin ini (dan `playwright install`
 * mengunduh dari jaringan), jadi peramban dipilih sendiri: PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, lalu Google
 * Chrome di macOS, lalu Chromium dari cache ms-playwright, lalu jalur Chromium di Linux.
 */
function findChromiumInCache(): string | undefined {
  const cache = join(homedir(), "Library", "Caches", "ms-playwright");
  if (!existsSync(cache)) return undefined;
  const dirs = readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
  for (const dir of dirs) {
    for (const rel of [
      "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium",
      "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
      "chrome-mac-x64/Chromium.app/Contents/MacOS/Chromium",
      "chrome-linux/chrome",
    ]) {
      const candidate = join(cache, dir, rel);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

function resolveExecutable(): string | undefined {
  const fromEnv = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (fromEnv) return fromEnv;
  const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (existsSync(chrome)) return chrome;
  const cached = findChromiumInCache();
  if (cached) return cached;
  return ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"].find((p) => existsSync(p));
}

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  outputDir: "./test-results",
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  fullyParallel: false,
  use: {
    baseURL: APP_URL,
    headless: true,
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    trace: "off",
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath: resolveExecutable(),
      // Tes berjalan di dalam sandbox-exec macOS: Chrome tidak bisa membuat sandbox-nya sendiri di sana.
      args: ["--no-sandbox", "--disable-background-networking", "--disable-component-update", "--no-first-run"],
    },
  },
  webServer: {
    command: `npx vite dev --host 127.0.0.1 --port ${APP_PORT} --strictPort`,
    url: APP_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      // Alamat backend dan Supabase menunjuk ke asal 127.0.0.1 yang sama dengan aplikasi; page.route mencegatnya.
      VITE_API_URL: API_URL,
      VITE_SUPABASE_URL: SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
      // Jalur kode sungguhan, bukan mode demo aplikasi.
      VITE_MOCK_MODE: "false",
      VITE_ENABLE_BILLING: "false",
    },
  },
});
