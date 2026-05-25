# Testing Guide - Applify AI Features
## Fitur: AI Job Discovery → AI Auto-Apply → Tier System (Free/Pro)

---

## 1. PERSIAPAN ENVIRONMENT

### A. File `.env` harus ada di root project:

```env
VITE_SUPABASE_URL=https://dreexbadvlxufkrvvwrq.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRyZWV4YmFkdmx4dWZrcnZ2d3JxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwODM2ODQsImV4cCI6MjA5NDY1OTY4NH0.e37-d4E6fFSF2Bc-HeriJbG562Q9FqzhB4GciAtaVUE
VITE_OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxx  # Optional untuk testing AI real
```

**Catatan:** Kalau `VITE_OPENROUTER_API_KEY` kosong, AI akan pakai fallback (simulasi lokal), tapi fitur tetap jalan.

### B. Pastikan dependencies terinstall:

```bash
npm install
```

### C. Jalankan dev server:

```bash
npm run dev
```
Buka: `http://localhost:5173`

---

## 2. TESTING FLOW UTAMA (End-to-End)

### Phase 1: Landing Page → Login

**Test Case 1.1: Landing Page Border Styles**
- [ ] Buka `http://localhost:5173`
- [ ] **Verify:** Card borders terlihat jelas (2px solid gray #999999, bukan tipis)
- [ ] **Verify:** Tidak ada border transparan `border-black/[5%]`
- [ ] Scroll ke bawah, cek section "Kenapa Applify?" dan "Platform"
- [ ] **Verify:** Semua card punya border tebal berwarna abu-abu

**Test Case 1.2: Google OAuth Login**
- [ ] Klik "Mulai Sekarang" atau "Masuk"
- [ ] Klik "Masuk dengan Google"
- [ ] **Verify:** Redirect ke Google consent screen
- [ ] Setelah approve, **Verify:** redirect ke `/dashboard`
- [ ] **Verify:** Sidebar menampilkan email user & avatar

---

### Phase 2: AI Job Discovery (`/jobs`)

**Test Case 2.1: Generate Demo Jobs**
- [ ] Buka `http://localhost:5173/jobs`
- [ ] **Verify:** Muncul tombol "Generate Demo Jobs"
- [ ] Klik "Generate Demo Jobs"
- [ ] **Verify:** Muncul 4 job cards dengan data lengkap
- [ ] **Verify:** Setiap card punya:
  - Match Score (circular progress)
  - Acceptance Potential
  - Company Culture Score
  - Growth Potential
  - Salary Benchmark (bar chart)
  - Skill Radar Chart (SVG)

**Test Case 2.2: Job Card Visualizations**
- [ ] Klik "Lihat Detail & Analisis AI" pada salah satu job card
- [ ] **Verify:** Card expand menampilkan:
  - AI Strategy (text panel)
  - Radar Chart (6 dimensi skill)
  - Salary Benchmark (bar chart vs market)
  - AI Action Timeline (step-by-step)
  - Skill Gaps (badge tags)
- [ ] Klik "Ringkas" untuk collapse

**Test Case 2.3: Filter & Search**
- [ ] Ketik "Engineer" di search box
- [ ] **Verify:** Hanya job dengan "Engineer" yang muncul
- [ ] Klik filter "Match ≥ 80%"
- [ ] **Verify:** Hanya job dengan match ≥ 80% yang muncul
- [ ] Klik filter "Remote" / "Hybrid" / "On-site"
- [ ] **Verify:** Filter berfungsi dengan benar

**Test Case 2.4: Save/Bookmark Job**
- [ ] Klik icon bookmark (outline) pada job card
- [ ] **Verify:** Icon berubah jadi `BookmarkCheck` (filled)
- [ ] Klik filter "Tersimpan"
- [ ] **Verify:** Job yang tersimpan muncul
- [ ] Klik lagi untuk unsave

**Test Case 2.5: AI Job Scanner**
- [ ] Klik "Buka AI Job Scanner"
- [ ] **Verify:** Muncul panel scanner dengan 6 platform
- [ ] Klik "Scan Job Sekarang"
- [ ] **Verify:** Animasi scanning berjalan:
  - Progress bar bergerak
  - Platform icons berubah status (idle → scanning → found)
  - Log status AI muncul di panel bawah
- [ ] Tunggu sampai selesai (simulasi ~10 detik)
- [ ] **Verify:** Muncul "X lowongan berhasil dianalisis!"

---

### Phase 3: AI Auto-Apply (`/jobs` → Klik "AI Apply")

**Test Case 3.1: AI Apply Modal (Free Tier)**
- [ ] Pastikan user baru (Free tier)
- [ ] Klik "AI Apply Sekarang" pada job card
- [ ] **Verify:** Modal muncul dengan:
  - Header: "AI Auto-Apply" + company + job title
  - Badge "FREE" (bukan "PRO")
  - Loading state: "AI Free Model sedang menganalisis..."
- [ ] Tunggu generate selesai
- [ ] **Verify:** Muncul 3 tab: Cover Letter, Optimized CV, AI Strategy
- [ ] Klik tab "Cover Letter"
- [ ] **Verify:** Cover letter ter-generate (walaupun simulasi)
- [ ] **Verify:** Badge "Basic AI" muncul di header
- [ ] **Verify:** AI Accuracy menunjukkan "70%"

**Test Case 3.2: Edit Cover Letter**
- [ ] Klik "Edit"
- [ ] **Verify:** Textarea muncul dengan isi cover letter
- [ ] Edit beberapa kata
- [ ] Klik "Simpan Perubahan"
- [ ] **Verify:** Cover letter terupdate

**Test Case 3.3: Regenerate Cover Letter**
- [ ] Klik "Regenerate"
- [ ] **Verify:** Loading state muncul
- [ ] **Verify:** Cover letter berubah (tone berbeda)

**Test Case 3.4: Submit Application**
- [ ] Klik "AI Apply Sekarang"
- [ ] **Verify:** Loading "Mengirim..."
- [ ] **Verify:** Modal close, redirect ke `/applications`
- [ ] Buka `/applications`
- [ ] **Verify:** Aplikasi muncul di Kanban board (status: Submitted)

---

### Phase 4: Tier System (Free vs Pro)

**Test Case 4.1: Free Tier Quota**
- [ ] Login dengan user Free tier
- [ ] Buka `/jobs`
- [ ] **Verify:** Badge "FREE" muncul di header
- [ ] **Verify:** Counter "X apply tersisa" menunjukkan 10
- [ ] Apply ke 1 job
- [ ] **Verify:** Counter berkurang jadi 9
- [ ] Apply 10 kali
- [ ] **Verify:** Counter menunjukkan 0
- [ ] **Verify:** Tombol "AI Apply" disabled atau muncul warning "Kuota Habis"

**Test Case 4.2: Upgrade ke Pro (Simulasi)**
- [ ] Buka Supabase Dashboard
- [ ] Edit subscription user: `plan_name = 'Pro'`, `daily_apply_quota = 20`
- [ ] Refresh `/jobs`
- [ ] **Verify:** Badge berubah jadi "PRO" (warna lime #D2F801)
- [ ] **Verify:** Counter menunjukkan 20 apply tersisa
- [ ] **Verify:** AI Accuracy menunjukkan "90%"

**Test Case 4.3: Pro Tier dengan Opus (High Match)**
- [ ] Pastikan user Pro tier
- [ ] Cari job dengan Match Score ≥ 80% (lihat circular progress)
- [ ] Klik "AI Apply Sekarang"
- [ ] **Verify:** Modal muncul badge "PRO"
- [ ] **Verify:** Loading state: "Claude Opus 4.5 sedang menganalisis..."
- [ ] Setelah generate:
  - **Verify:** Stats card menunjukkan "Opus" / "Premium"
  - **Verify:** Badge "Claude Opus 4.5 🔥" di header Cover Letter
  - **Verify:** Penjelasan: "High-match job menggunakan Claude Opus..."
  - **Verify:** Tombol: "AI Apply dengan Opus 🔥"

**Test Case 4.4: Pro Tier dengan Sonnet (Regular Match)**
- [ ] Cari job dengan Match Score < 80%
- [ ] Klik "AI Apply Sekarang"
- [ ] **Verify:** Stats card menunjukkan "Sonnet" / "Advanced"
- [ ] **Verify:** Badge "Claude Sonnet 4.5" di header Cover Letter
  - **Verify:** Penjelasan: "Regular job menggunakan Claude Sonnet..."
  - **Verify:** Tombol: "AI Apply dengan Sonnet"

---

### Phase 5: Applications Tracking (`/applications`)

**Test Case 5.1: Kanban View**
- [ ] Buka `/applications`
- [ ] **Verify:** Muncul Kanban board dengan 6 kolom:
  - Draft, Ready, Submitted, Follow-up, Responded, Closed
- [ ] **Verify:** Aplikasi yang baru di-submit muncul di kolom "Submitted"
- [ ] **Verify:** Setiap card menunjukkan job title, company, dan sisa hari

**Test Case 5.2: List View**
- [ ] Klik tombol "List" (di kanan atas)
- [ ] **Verify:** Tampilan berubah jadi list
- [ ] **Verify:** Setiap row menunjukkan job info + status badge

**Test Case 5.3: Application Detail**
- [ ] Klik salah satu card di Kanban
- [ ] **Verify:** Modal muncul dengan detail:
  - Status badge
  - Cover letter lengkap
  - Tailored skills
  - AI Strategy Notes
  - Follow-up schedule (kalau ada)

---

### Phase 6: Database Verification

**Test Case 6.1: Check Tables via Supabase Dashboard**
- [ ] Buka Supabase Dashboard → Table Editor
- [ ] **Verify tabel `jobs`:** 4 mock jobs tersimpan dengan AI analysis fields
- [ ] **Verify tabel `ai_applications`:** Applications tersimpan dengan cover_letter
- [ ] **Verify tabel `daily_usage`:** Usage ter-track per hari
- [ ] **Verify tabel `subscriptions`:** Tier user benar (free/pro)

---

### Phase 7: Error Handling

**Test Case 7.1: No OpenRouter API Key**
- [ ] Hapus `VITE_OPENROUTER_API_KEY` dari `.env`
- [ ] Restart dev server
- [ ] Coba AI Apply
- [ ] **Verify:** Muncul error "OpenRouter API key not configured"
- [ ] **Verify:** Fallback ke simulasi lokal (cover letter tetap generate)

**Test Case 7.2: Quota Exceeded**
- [ ] Apply 10 kali dengan user Free
- [ ] Coba apply ke-11
- [ ] **Verify:** Muncul warning "Kuota harian sudah habis"
- [ ] **Verify:** Tombol apply disabled

**Test Case 7.3: Network Error**
- [ ] Matikan WiFi sesaat saat AI generating
- [ ] **Verify:** Error handling muncul dengan pesan yang jelas
- [ ] **Verify:** Loading state berhenti

---

## 3. TESTING CHECKLIST (Quick Reference)

```
□ Login dengan Google OAuth
□ Landing page borders tebal & gray
□ Generate 4 demo jobs
□ Job card dengan radar chart, progress rings, salary benchmark
□ AI Job Scanner animation
□ Save/unsave job
□ Filter & search berfungsi
□ AI Apply modal (cover letter, CV, strategy)
□ Edit & regenerate cover letter
□ Submit application
□ Applications muncul di Kanban
□ Free tier: 10 apply/day limit
□ Pro tier: 20 apply/day + Opus/Sonnet hybrid
□ Quota counter berkurang setelah apply
□ Database tables terisi dengan benar
□ Error handling (no API key, quota exceeded, network)
```

---

## 4. TROUBLESHOOTING

### Problem: AI Apply modal stuck loading
**Solution:** 
- Cek browser console untuk error
- Kalau OpenRouter API key tidak ada, akan pakai simulasi (harusnya tetap jalan)
- Refresh page dan coba lagi

### Problem: Job cards tidak muncul
**Solution:**
- Pastikan sudah klik "Generate Demo Jobs"
- Cek Supabase Dashboard → Table Editor → jobs (harus ada 4 rows)
- Kalau kosong, generate ulang

### Problem: Badge tier tidak berubah setelah upgrade
**Solution:**
- Refresh halaman (tier di-load saat mount)
- Cek Supabase: subscriptions table → ai_model_tier harus 'pro'

### Problem: Build error saat deploy
**Solution:**
- Pastikan `vercel.json` ada di root
- Pastikan tidak ada import yang missing
- Run `npm run build` lokal untuk verify

---

## 5. SCREENSHOTS YANG PERLU DIAMBIL (Untuk Dokumentasi)

1. **Landing Page:** Hero section + border styles
2. **Jobs Page:** AI Scanner + Job Cards dengan visualizations
3. **Job Card Expanded:** Radar chart + salary benchmark + timeline
4. **AI Apply Modal:** Cover letter + tier badge + model info
5. **Applications Page:** Kanban board dengan aplikasi
6. **Mobile View:** Test responsive di device kecil

---

**Testing selesai!** Kalau semua checkbox tercentang, fitur siap deploy. 🎉
