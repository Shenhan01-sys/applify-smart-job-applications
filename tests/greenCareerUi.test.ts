import { test } from "node:test";
import assert from "node:assert/strict";
import { greenCareerListNotice } from "../src/lib/greenCareerUi.ts";

test("greenCareerListNotice: daftar berisi 2 lowongan menjelaskan penyaringan ketat dan asesmen tidak mengirim lamaran", () => {
  const n = greenCareerListNotice(2);
  assert.match(n.title, /2 lowongan karier hijau terverifikasi/i);
  assert.match(n.body, /Ikuti Asesmen/);
  assert.match(n.body, /tidak mengirim lamaran/i);
});

test("greenCareerListNotice: daftar kosong memberi penjelasan jelas tanpa kesan rusak", () => {
  const n = greenCareerListNotice(0);
  assert.match(n.title, /Belum ada lowongan karier hijau terverifikasi/i);
  assert.match(n.body, /lingkungan/i);
});
