# Applify AI Job Automation Architecture
## Research: Job Platform APIs, MCPs & Human-in-the-Loop

---

## 1. Executive Summary

**Vision:** AI Agent yang bisa mencari dan meng-apply lowongan secara otomatis, dengan **human approval** sebagai checkpoint kritis.

**Key Finding:** LinkedIn dan platform Indonesia (Jobstreet, Glints, Kalibrr, KitaLulus, Dealls) **tidak menyediakan public API untuk job seekers**. Mayoritas hanya punya employer-side API. Solusi harus hybrid:
1. **API-first** untuk aggregator global (JSearch, Adzuna, SerpAPI)
2. **Browser automation** untuk platform Indonesia & LinkedIn

---

## 2. Platform Landscape

### A. Global Job Aggregators dengan API

| Platform | API Availability | Job Seeker API | Cost | Indonesia Coverage |
|----------|-----------------|----------------|------|-------------------|
| **JSearch (RapidAPI)** | ✅ Yes | ✅ Search + Details | Freemium ($0-29/mo) | Limited (global focus) |
| **Adzuna API** | ✅ Yes | ✅ Search | 1,000 calls/day free | Limited (UK, AU, US strong) |
| **SerpAPI (Google Jobs)** | ✅ Yes | ✅ Scrapes Google Jobs | $50-200/mo | Global |
| **Indeed Publisher API** | ⚠️ Deprecated | ❌ No | - | Global |
| **Reed.co.uk API** | ✅ Yes | ✅ Search | Free tier | UK only |
| **USA Jobs API** | ✅ Yes | ✅ Search | Free | US government only |

### B. LinkedIn

| Product | Type | For Job Seekers? |
|---------|------|-----------------|
| Apply Connect | Employer API | ❌ No |
| Apply with LinkedIn | Employer plugin | ❌ No |
| Job Posting API | Employer API | ❌ No |
| Recruiter System Connect | ATS Integration | ❌ No |
| **LinkedIn Job Search** | **No Public API** | **Must use scraping** |

### C. Indonesian Job Platforms

| Platform | Public API | Notes |
|----------|-----------|-------|
| **Jobstreet (SEEK)** | ❌ No | SEEK has partner API but limited, must scrape |
| **Glints** | ❌ No | No public API, must scrape |
| **Kalibrr** | ❌ No | No public API, must scrape |
| **KitaLulus** | ❌ No | No public API, must scrape |
| **Dealls** | ❌ No | No public API, must scrape |
| **LinkedIn Indonesia** | ❌ No | Same as global |

---

## 3. Automation Tools (For Platforms without API)

### A. Browser Automation

| Tool | Pros | Cons | Best For |
|------|------|------|----------|
| **Playwright** | Modern, reliable, stealth mode | Requires infra, detection risk | LinkedIn, complex forms |
| **Puppeteer** | Large ecosystem, Chrome DevTools | Heavier, easier detection | Simple scraping |
| **Selenium** | Mature, many bindings | Slower, outdated | Legacy systems |
| **Browserless** | Cloud-hosted headless | Cost, latency | Scale without infra |

### B. Scraping as a Service

| Service | Pros | Cons | Cost |
|---------|------|------|------|
| **Apify** | Scraper marketplace, scheduling | Per-usage cost | $49-499/mo |
| **ScrapingBee** | Proxy rotation, JS rendering | Per-request cost | $49-200+/mo |
| **Bright Data** | Residential proxies | Expensive | Enterprise pricing |

### C. Workflow Automation (Human-in-the-Loop)

| Tool | Human Approval Feature | Integration | Best For |
|------|------------------------|-------------|----------|
| **n8n** | ✅ Wait node, manual approval | 400+ integrations | Workflow orchestration |
| **Make (Integromat)** | ✅ Pause/scenario | Visual builder | Business users |
| **Temporal** | ✅ Signals for approval | Code-first | Complex workflows |

---

## 4. MCP Server Landscape

### Existing MCP Servers for Jobs

| MCP Server | Functionality | Status |
|------------|--------------|--------|
| **@apify/mcp-server** | Run Apify scrapers via MCP | Available |
| **@browserbase/mcp-server** | Browser automation via MCP | Available |
| **@magicus/playwright-mcp** | Playwright browser control | Community |
| **Custom JSearch MCP** | Would need to build | Not yet built |
| **Custom Job Scraper MCP** | Would need to build | Not yet built |

### Recommendation: Build Custom MCP Server

```
┌─────────────────────────────────────────────────────┐
│                  Applify MCP Server                  │
├─────────────────────────────────────────────────────┤
│  Tools:                                              │
│  ├── search_jobs(query, location, platform)         │
│  ├── get_job_details(job_id, platform)              │
│  ├── analyze_job_match(job_id, user_id)           │
│  ├── generate_application(job_id, tone)            │
│  ├── submit_application(job_id, approval_token)    │
│  └── schedule_follow_up(application_id, days)      │
│                                                      │
│  Adapters:                                           │
│  ├── jsearch_api (global aggregator)               │
│  ├── serpapi_google_jobs (Google Jobs)              │
│  ├── playwright_linkedin (scraping)                │
│  ├── playwright_jobstreet (scraping)              │
│  └── playwright_glints (scraping)                 │
└─────────────────────────────────────────────────────┘
```

---

## 5. Recommended Architecture (Hybrid + Human-in-the-Loop)

### Phase 1: API-First Discovery (Global)
```
User → Applify AI → JSearch API / SerpAPI
                    ↓
              Job Results
                    ↓
              AI Analysis
                    ↓
            Human Review Card
```

### Phase 2: Browser Automation Discovery (Indonesia + LinkedIn)
```
User → Applify AI → Playwright Scraper (scheduled daily)
                    ↓
              Job Results (stored in DB)
                    ↓
              AI Analysis (match, acceptance, strategy)
                    ↓
            Human Review Card (with rich viz)
```

### Phase 3: Auto-Apply with Human Approval
```
Human clicks "AI Apply" on a job card
                    ↓
        AI fetches full profile from DB
                    ↓
        AI generates: Cover Letter + Optimized CV + Strategy
                    ↓
        [HUMAN APPROVAL MODAL]
        User reviews & edits → Approve / Reject / Save Draft
                    ↓
        If Approved:
        ├── API platforms: Direct submit via API
        └── No-API platforms: Playwright fills form + human clicks final submit
                    ↓
        Store in ai_applications table
        Schedule follow-up in calendar
```

---

## 6. Implementation Roadmap

### Sprint 1: Foundation
- [ ] Set up JSearch API account (RapidAPI)
- [ ] Build MCP server skeleton with `search_jobs` tool
- [ ] Integrate JSearch into job scanner

### Sprint 2: Browser Automation
- [ ] Build Playwright scraper for LinkedIn Jobs
- [ ] Build scraper for 1 Indonesian platform (start with Jobstreet)
- [ ] Store scraped jobs in `jobs` table with AI analysis fields

### Sprint 3: Human-in-the-Loop
- [ ] Enhance AIApplyModal with comparison view (before/after)
- [ ] Add "Approve & Submit" vs "Edit First" vs "Reject" buttons
- [ ] Implement draft saving with expiration (7 days)

### Sprint 4: Smart Submission
- [ ] For API-enabled platforms: auto-submit after approval
- [ ] For no-API platforms: Playwright opens form pre-filled, human clicks final submit
- [ ] CAPTCHA handling (2captcha integration or human solve)

### Sprint 5: Follow-up & Tracking
- [ ] Automated follow-up email scheduler
- [ ] Response detection (email parsing or LinkedIn notification scraping)
- [ ] Pipeline movement (Kanban board auto-update)

---

## 7. Key Technical Decisions

### Why Playwright over Puppeteer?
- **Stealth plugins available** (playwright-extra-plugin-stealth)
- **Mobile emulation** (many job platforms are mobile-first)
- **Session persistence** (save cookies between runs)
- **Codegen** (record user interactions for form mapping)

### Why n8n for Orchestration?
- **Built-in human approval nodes** (`Wait` node with webhook)
- **Supabase integration** (native node)
- **Email nodes** (for follow-up)
- **Scheduling** (cron triggers for daily scanning)

### Why Custom MCP over existing?
- **No existing MCP** covers Indonesian job platforms
- **Full control** over rate limiting and anti-detection
- **Unified interface** for AI regardless of backend (API vs scraping)

---

## 8. Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Platform blocks scraper | Rotating residential proxies, stealth plugins, human-like delays |
| CAPTCHA on apply forms | 2captcha API or pause for human solve |
| ToS violation | Focus on user-initiated actions, don't spam, respect rate limits |
| Data accuracy | Dual-source verification (API + scraping cross-check) |
| Human approval bottleneck | Smart defaults (pre-approved for high-match jobs with user setting) |

---

## 9. Budget Estimate (Monthly)

| Service | Cost | Purpose |
|---------|------|---------|
| JSearch API (RapidAPI) | $0-29 | Global job search |
| SerpAPI | $50-200 | Google Jobs scraping |
| Playwright/Browserless | $0-50 | Browser automation |
| ScrapingBee/Proxy | $49 | Anti-detection proxies |
| 2captcha | Pay-per-use | CAPTCHA solving |
| Supabase | $0-25 | Database & hosting |
| **Total** | **$100-350/mo** | Full automation stack |

---

## 10. Conclusion

**Bottom line:** Full autonomous apply tidak feasible karena:
1. Platform besar (LinkedIn, Jobstreet, Glints) tidak punya job seeker API
2. Anti-bot measures makin canggih
3. Legal/ToS concerns

**Solusi optimal:**
- **AI discovers** jobs via hybrid (API + scraping)
- **AI analyzes** dan generates application materials
- **AI pre-fills** application forms
- **Human approves** sebelum final submit
- **AI handles** follow-up dan tracking

Ini memberikan **80% time savings** untuk user tapi tetap **100% human control**.
