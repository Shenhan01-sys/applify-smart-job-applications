# Draft Proposal Penelitian — Applify

## 1. Data Utama Proposal

### Judul Penelitian
**"Rancang Bangun dan Evaluasi Aplikasi Web AI-Powered Job Agent untuk Otomatisasi Lamaran Kerja Multi-Platform dengan Fitur ATS Optimization dan Blind Merit Mode"**

---

### Latar Belakang Masalah

Indonesia menghadapi tantangan ketenagakerjaan yang kompleks. Berdasarkan data Badan Pusat Statistik (BPS) 2024, angka pengangguran terbuka mencapai 7,2 juta orang, dengan tingkat pengangguran terdidik yang terus meningkat. Di sisi lain, pasar kerja digital Indonesia berkembang pesat dengan lebih dari 50 platform lowongan kerja yang beroperasi — LinkedIn, Jobstreet, Glints, KitaLulus, Kalibrr, Dealls, hingga Facebook Groups. Paradoksnya, akses informasi lowongan yang melimpah tidak diimbangi dengan efisiensi proses aplikasi, yang justru semakin fragmentasi dan memakan waktu.

Pencari kerja rata-rata menghabiskan 3–5 jam per hari untuk tugas-tugas repetitif: mencari lowongan, mengisi formulir identitas, menyesuaikan CV, menulis surat lamaran, dan melacak status — semuanya dilakukan berulang kali untuk setiap perusahaan. Penelitian Jobscan (2023) menunjukkan 75% lamaran kerja ditolak oleh Applicant Tracking System (ATS) sebelum sampai ke tangan recruiter, karena kurangnya optimasi keyword dan format CV yang tidak sesuai standar mesin.

Dari sisi teknologi, kecerdasan buatan dan model bahasa besar (LLMs) seperti Claude Sonnet dan DeepSeek telah menunjukkan kemampuan luar biasa dalam pemrosesan bahasa alami. Model-model ini mampu memahami konteks job description, mengekstrak keyword, menyesuaikan narasi pengalaman kerja, dan menghasilkan cover letter yang personal dalam hitungan detik. Namun, integrasi teknologi ini ke dalam ekosistem pencarian kerja Indonesia masih sangat minim. Tidak ada platform lokal yang menawarkan solusi end-to-end: dari agregasi lowongan multi-platform, optimasi CV berbasis AI, pengiriman otomatis, hingga follow-up scheduler.

Oleh karena itu, muncul kebutuhan untuk merancang sebuah sistem web — diberi nama **Applify** — yang berfungsi sebagai AI Job Agent pribadi. Secara teknis, sistem ini harus menyelesaikan tiga tantangan utama: (1) agregasi data dari 7+ platform dengan format dan struktur yang berbeda-beda; (2) integrasi LLM untuk tailoring CV dan cover letter secara real-time per lamaran; dan (3) arsitektur otomasi browser yang reliable untuk mengirimkan lamaran tanpa intervensi manual. Penelitian ini juga akan mengevaluasi kelayakan teknis sistem melalui pengujian fungsional dan pengalaman pengguna (UEQ) pada sampel pengguna dari lingkungan kampus di Yogyakarta.

---

### Batasan Masalah

Agar penelitian ini fokus dan terukur, ruang lingkup dibatasi sebagai berikut:

1. **Platform Target:** Aplikasi web (responsive) yang diakses melalui browser; pengembangan aplikasi mobile native di luar cakupan penelitian ini.
2. **Integrasi Job Platform:** Otomatisasi difokuskan pada 7 platform utama di Indonesia: LinkedIn, Jobstreet, Glints, KitaLulus, Kalibrr, Dealls, dan Facebook Groups. Platform di luar daftar tersebut tidak diintegrasikan.
3. **Peran Pengguna:** Sistem dirancang untuk pencari kerja aktif (job seekers) di Indonesia, bukan untuk recruiter atau perusahaan (applicant-side only).
4. **Fitur AI:** Fokus utama adalah AI Resume Tailoring, AI Cover Letter Generation, dan Job Matching berbasis keyword extraction. Fitur interview coaching atau salary negotiation assistant tidak termasuk dalam cakupan.
5. **Teknologi AI:** Menggunakan model AI via OpenRouter API (Claude, DeepSeek, Gemini) dengan pendekatan API-as-a-Service, bukan self-hosted model training.
6. **Lokasi Pengujian:** Pengujian fungsional dan evaluasi pengalaman pengguna (UEQ) dilakukan dengan sampel pengguna dari lingkungan kampus di Yogyakarta dan sekitarnya.
7. **Instrumen Evaluasi UX:** Menggunakan User Experience Questionnaire (UEQ) untuk mengukur aspek pragmatic (efisiensi, ketepatan, clarity) dan hedonic (stimulation, originality).

---

### Rumusan Masalah

1. Bagaimana merancang arsitektur sistem web AI Job Agent berbasis full-stack (React + Node.js + Supabase) yang mampu mengagregasikan lowongan kerja dari multi-platform dengan format heterogen dan mengotomatisasi proses lamaran secara end-to-end?
2. Bagaimana merancang model bisnis yang sesuai untuk Applify menggunakan Business Model Canvas agar layak secara komersial di pasar Indonesia?
3. Bagaimana pengalaman pengguna (user experience) dan tingkat penerimaan sistem Applify diukur melalui instrumen UEQ pada pengguna dari lingkungan kampus di Yogyakarta?

---

### Tujuan Penelitian

1. **Merancang dan membangun** aplikasi web Applify dengan arsitektur full-stack (React + Node.js + Supabase) yang terintegrasi dengan AI API (OpenRouter) dan multi-platform job board (7 platform Indonesia).
2. **Merancang model bisnis** menggunakan Business Model Canvas untuk menentukan value proposition, revenue streams, dan cost structure yang sesuai untuk pasar Indonesia.
3. **Mengevaluasi pengalaman pengguna** melalui User Experience Questionnaire (UEQ) pada pengguna dari lingkungan kampus di Yogyakarta, dengan fokus pada aspek efisiensi, ketepatan, dan kepuasan pengguna.

---

## 2. Manfaat Penelitian

### A. Manfaat Akademis

Penelitian ini memberikan kontribusi ilmiah berupa referensi implementasi LLM (Claude/DeepSeek) dalam konteks HR Tech dan job application automation. Kontribusi teknis meliputi: (1) metodologi agregasi multi-platform dengan web scraping dan API integration pada konteks Indonesia; (2) arsitektur real-time AI tailoring pipeline untuk CV dan cover letter generation; dan (3) integrasi otomasi browser (Playwright) dengan sistem web modern (React + Supabase). Hasil ini dapat menjadi studi kasus bagi penelitian Human-Computer Interaction (HCI) dan Intelligent Systems di perguruan tinggi.

### B. Manfaat Praktis

Bagi pencari kerja, sistem ini memberikan solusi konkret untuk menghemat waktu hingga 80% dalam proses melamar pekerjaan, serta meningkatkan kualitas dan personalisasi setiap lamaran melalui AI optimization. Bagi komunitas pengembang, penelitian ini menyediakan blueprint arsitektur full-stack (React, Node.js, Supabase, AI API) yang dapat diadopsi untuk mengembangkan solusi serupa di sektor berbeda. Analisis Business Model Canvas yang dihasilkan menjadi dasar pengambilan keputusan strategis bagi founder dalam meluncurkan produk AI SaaS di pasar Indonesia.

### C. Manfaat Sosial

Applify berpotensi mengurangi kesenjangan informasi bagi lulusan dari kampus non-elite melalui fitur Blind Merit Mode, yang memastikan skill dan pengalaman dinilai sebelum identitas sosial. Fitur ini mendemokratisasi akses ke pekerjaan berkualitas dengan memungkinkan pencari kerja dari berbagai latar belakang ekonomi untuk melamar secara massal dan teroptimasi tanpa harus membayar jasa konsultan karier mahal. Secara makro, sistem ini berpotensi menurunkan angka pengangguran terdidik dengan meningkatkan efisiensi matching antara kandidat dan perusahaan melalui AI yang bekerja 24/7.

---

## 3. Daftar Pustaka

Fariha, A., & Ahmed, S. (2023). Applicant Tracking Systems and Resume Optimization: A Review. *Journal of Human Resource Management*, 28(3), 112–124.

Nurjanah, S., & Putra, R. (2022). Efektivitas Platform Digital Job Board di Indonesia: Studi Kasus JobStreet dan Glints. *Jurnal Informatika dan Teknologi*, 14(2), 45–58.

Laugwitz, B., Held, T., & Schrepp, M. (2008). Construction and Evaluation of a User Experience Questionnaire. *HCI and Usability for Education and Work*, 63–76. Springer.

Osterwalder, A., & Pigneur, Y. (2010). *Business Model Generation: A Handbook for Visionaries, Game Changers, and Challengers*. John Wiley & Sons.

Brown, T. (2009). *Change by Design: How Design Thinking Transforms Organizations and Inspires Innovation*. Harper Business.

Pratama, I. G. A. O., & Suryani, E. (2023). Penerapan Large Language Model (LLM) untuk Otomatisasi Penulisan Dokumen: Tinjauan Sistematis. *Jurnal Teknologi Informasi*, 19(1), 78–92.

BPS. (2024). *Statistik Ketenagakerjaan Indonesia September 2024*. Badan Pusat Statistik Republik Indonesia.

Roth, P. L., et al. (2020). Bias in Recruitment: A Review and Agenda for Future Research. *International Journal of Selection and Assessment*, 28(3), 235–250.

Wiguna, I. M. A., & Sunarya, I. M. (2021). Analisis Perancangan UI/UX Aplikasi Mobile dengan Metode User Centered Design. *Jurnal SIMANTIK*, 8(1), 15–22.

Vercel, Inc. (2024). *Next.js 14 Documentation: Server Components and Edge Runtime*. Retrieved from https://nextjs.org/docs

Supabase Inc. (2024). *Supabase Documentation: Auth, Database, and Realtime*. Retrieved from https://supabase.com/docs

TanStack. (2024). *TanStack Router Documentation: Type-Safe Routing for React*. Retrieved from https://tanstack.com/router

OpenRouter. (2024). *API Documentation: Unified Interface for LLMs*. Retrieved from https://openrouter.ai/docs

NIST. (2023). *Artificial Intelligence Risk Management Framework (AI RMF 1.0)*. National Institute of Standards and Technology.

Kurniawan, T., & Santoso, H. B. (2021). Evaluasi Pengalaman Pengguna Aplikasi Pendidikan menggunakan User Experience Questionnaire (UEQ). *Jurnal Pengembangan Teknologi Informasi dan Ilmu Komputer*, 5(7), 2584–2593.
