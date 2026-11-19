import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Static wiring checks for fixes that live in React components (the suite has no DOM). They read the
// source text, as the other tests in this folder do.
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("Toaster dipasang di rute akar: tanpa itu semua toast.success/toast.error tidak terlihat", () => {
  const root = read("../src/routes/__root.tsx");
  assert.match(root, /import \{ Toaster \} from "@\/components\/ui\/sonner"/);
  assert.match(root, /<Toaster\b/);
  // sanity: komponen memang memanggil toast (kalau ini berubah, tes ini perlu ditinjau)
  assert.match(read("../src/components/ApprovalReviewModal.tsx"), /toast\.(success|error)/);
});

test("Gerbang Persetujuan dapat digulir sampai jawaban formulir (bukan ScrollArea tanpa tinggi pasti)", () => {
  const src = readFileSync(new URL("../src/components/ApprovalReviewModal.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /<ScrollArea/);
  assert.match(src, /flex-1 min-h-0 overflow-y-auto/);
});
