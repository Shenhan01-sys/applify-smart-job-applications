import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ApiConfigError, DEV_API_URL, flagOn, resolveApiBaseUrl } from "../src/lib/appConfig.ts";
import { describeApiError } from "../src/lib/apiErrors.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("VITE_API_URL yang diisi selalu dipakai, garis miring di ujung dibuang", () => {
  assert.equal(resolveApiBaseUrl({ VITE_API_URL: "https://api.applify.test/", DEV: false }), "https://api.applify.test");
  assert.equal(resolveApiBaseUrl({ VITE_API_URL: " https://api.applify.test ", DEV: true }), "https://api.applify.test");
});

test("tanpa VITE_API_URL: localhost hanya di mode dev, build produksi menghasilkan null (galat konfigurasi)", () => {
  assert.equal(resolveApiBaseUrl({ DEV: true }), DEV_API_URL);
  assert.equal(resolveApiBaseUrl({ VITE_API_URL: "", DEV: true }), DEV_API_URL);
  assert.equal(resolveApiBaseUrl({ DEV: false }), null);
  assert.equal(resolveApiBaseUrl({ VITE_API_URL: "   ", DEV: false }), null);
  assert.equal(resolveApiBaseUrl({}), null);
});

test("ApiConfigError dijelaskan ke pengguna dalam bahasa Indonesia, tanpa menyebut localhost", () => {
  const msg = describeApiError(new ApiConfigError(), "Gagal");
  assert.match(msg, /Alamat server Applify belum diatur/);
  assert.match(msg, /Hubungi pengelola/);
  assert.doesNotMatch(msg, /localhost/);
});

test("flagOn hanya menganggap string persis 'true'", () => {
  assert.equal(flagOn("true"), true);
  for (const v of [undefined, "", "TRUE", "1", "false"]) assert.equal(flagOn(v), false);
});

test("automationApi: data contoh hanya lewat mode demo, galat GET tidak lagi diganti data palsu", () => {
  const src = read("../src/services/automationApi.ts");
  assert.doesNotMatch(src, /localhost:4000/);
  assert.doesNotMatch(src, /canFallback|using fallback data/);
  // mockFn hanya dijalankan di dalam cabang isMockMode()
  const body = src.slice(src.indexOf("async function apiFetch"), src.indexOf("export interface AutomationSettings"));
  assert.match(body, /if \(isMockMode\(\) && mockFn\)/);
  assert.equal((body.match(/mockFn\(\)/g) ?? []).length, 1);
  assert.doesNotMatch(body, /catch/);
});
