import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SAVED_JOB_UNKNOWN, buildSavedJobRow, savedJobPlatform, savedJobType } from "../src/lib/savedJob.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const JOB = {
  id: "job-1",
  title: "  Staf IT Support ",
  company: "PT Maju Jaya",
  platform_source: "jobstreet",
  external_url: "https://id.jobstreet.com/id/job/1",
  location: "Yogyakarta",
  type: "full-time",
  requirements: ["Excel", "  Komunikasi ", "", 7, null],
  salary_min: 5000000,
  salary_max: 7000000,
  salary_currency: "IDR",
  salary_period: "monthly",
};

test("buildSavedJobRow: kolom NOT NULL (company_name, role_title, platform) terisi dari lowongan", () => {
  const row = buildSavedJobRow("user-1", JOB);
  assert.equal(row.user_id, "user-1");
  assert.equal(row.job_id, "job-1");
  assert.equal(row.company_name, "PT Maju Jaya");
  assert.equal(row.role_title, "Staf IT Support");
  assert.equal(row.platform, "JobStreet");
});

test("buildSavedJobRow: kolom opsional dipetakan dari lowongan, requirements hanya string tidak kosong", () => {
  const row = buildSavedJobRow("user-1", JOB);
  assert.equal(row.job_url, "https://id.jobstreet.com/id/job/1");
  assert.equal(row.location, "Yogyakarta");
  assert.equal(row.job_type, "Full-time");
  assert.deepEqual(row.requirements, ["Excel", "Komunikasi"]);
  assert.match(row.salary_range ?? "", /Rp 5.7 jt \/ bulan/);
});

test("buildSavedJobRow: nilai yang hilang jadi pengganti pada kolom wajib dan null pada kolom opsional", () => {
  const row = buildSavedJobRow("user-1", { id: "job-2", title: "   ", company: null, platform_source: undefined });
  assert.equal(row.company_name, SAVED_JOB_UNKNOWN);
  assert.equal(row.role_title, SAVED_JOB_UNKNOWN);
  assert.equal(row.platform, SAVED_JOB_UNKNOWN);
  assert.equal(row.job_url, null);
  assert.equal(row.salary_range, null);
  assert.equal(row.location, null);
  assert.equal(row.job_type, null);
  assert.equal(row.requirements, null);
  for (const col of [row.company_name, row.role_title, row.platform]) assert.ok(col.trim().length > 0);
});

test("buildSavedJobRow: tidak mengirim kolom yang bernilai bawaan di database", () => {
  const keys = Object.keys(buildSavedJobRow("user-1", JOB)).sort();
  assert.deepEqual(keys, [
    "company_name", "job_id", "job_type", "job_url", "location", "platform", "requirements", "role_title", "salary_range", "user_id",
  ]);
});

test("savedJobType: hanya empat nilai CHECK saved_jobs_job_type_check; tipe lain jadi null", () => {
  assert.equal(savedJobType("full-time"), "Full-time");
  assert.equal(savedJobType("Part_Time"), "Part-time");
  assert.equal(savedJobType("contract"), "Contract");
  assert.equal(savedJobType("internship"), "Internship");
  assert.equal(savedJobType("freelance"), null);
  assert.equal(savedJobType("temporary"), null);
  assert.equal(savedJobType(""), null);
  assert.equal(savedJobType(undefined), null);
});

test("savedJobPlatform: label tampilan untuk sumber dikenal, apa adanya untuk sumber lain, pengganti bila kosong", () => {
  assert.equal(savedJobPlatform("glints"), "Glints");
  assert.equal(savedJobPlatform("e2e-mock"), "e2e-mock");
  assert.equal(savedJobPlatform(""), SAVED_JOB_UNKNOWN);
  assert.equal(savedJobPlatform(null), SAVED_JOB_UNKNOWN);
});

test("jobs: insert saved_jobs memakai buildSavedJobRow dengan baris lowongan, bukan hanya user_id dan job_id", () => {
  const src = read("../src/routes/jobs.tsx");
  assert.match(src, /import \{ buildSavedJobRow \} from "@\/lib\/savedJob"/);
  assert.match(src, /const toggleSaveJob = async \(job: JobData\)/);
  assert.match(src, /\.from\("saved_jobs"\)\.insert\(buildSavedJobRow\(user\.id, job\)\)/);
  assert.doesNotMatch(src, /insert\(\{ user_id: user\.id, job_id: jobId \}\)/);
  assert.match(src, /onToggleSave=\{\(\) => toggleSaveJob\(job\)\}/);
});

test("saved_jobs hanya ditulis dari halaman Lowongan (satu tempat insert)", () => {
  const src = read("../src/routes/jobs.tsx");
  assert.equal([...src.matchAll(/from\("saved_jobs"\)\.insert/g)].length, 1);
});
