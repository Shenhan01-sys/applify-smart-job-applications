# Applify AI Model Strategy & OpenRouter Integration

## OpenRouter Free Models (For Free Tier)

### Top Recommendations untuk Job Application AI:

| Model | ID | Strength | Weakness | Use Case |
|-------|-----|----------|----------|----------|
| **DeepSeek V4 Flash** | `deepseek/deepseek-v4-flash:free` | Reasoning kuat, cepat | Context window lebih kecil | Analysis, scoring |
| **Trinity Large Thinking** | `arcee-ai/trinity-large-thinking:free` | Frontier-scale, open-weight | Latency tinggi | Cover letter generation |
| **Qwen3 Next 80B** | `qwen/qwen3-next-80b-a3b-instruct:free` | Multilingual (bagus untuk Indonesia) | Resource heavy | Multilingual support |
| **Gemma 4 31B** | `google/gemma-4-31b-it:free` | Google quality, reliable | Less creative | Structured output |
| **Nemotron 3 Super** | `nvidia/nemotron-3-super-120b-a12b:free` | Very large model | Slow | Complex analysis |

### Free Tier Strategy:
- **Default Router:** `openrouter/free` (auto-select free model)
- **Fallback Chain:** DeepSeek → Qwen3 → Gemma → Trinity
- **Rate Limit:** ~20 requests/minute (varies by model)
- **Expected Acceptance Accuracy:** 65-75% (karena model gratis lebih basic)

## Paid Models (For Pro Tier)

| Model | ID | Strength | Cost (per 1M tokens) |
|-------|-----|----------|---------------------|
| **Claude 3.5 Sonnet** | `anthropic/claude-3.5-sonnet` | Best for creative writing (cover letters) | $3 input / $15 output |
| **GPT-4o** | `openai/gpt-4o` | Best all-rounder, structured output | $2.50 input / $10 output |
| **Claude 3 Opus** | `anthropic/claude-3-opus` | Highest quality, most nuanced | $15 input / $75 output |
| **DeepSeek V3** | `deepseek/deepseek-chat` | Strong reasoning, very cheap | $0.50 input / $2 output |

### Pro Tier Strategy:
- **Default:** `anthropic/claude-3.5-sonnet` (best cover letters)
- **Analysis/Scoring:** `openai/gpt-4o` (structured JSON reliable)
- **Fallback:** `deepseek/deepseek-chat` (cost-effective)
- **Expected Acceptance Accuracy:** 80-90%

## Tier Comparison

| Feature | Free (Basic AI) | Pro (Advanced AI) |
|---------|----------------|-----------------|
| **Apply Limit** | 10/day | 50/day |
| **AI Model** | OpenRouter Free Models | Claude 3.5 / GPT-4o |
| **Acceptance Prediction** | 65-75% accuracy | 80-90% accuracy |
| **Cover Letter Quality** | Standard | Premium (human-like) |
| **CV Optimization** | Basic keyword matching | Deep semantic analysis |
| **Follow-up Strategy** | Generic template | Personalized AI-generated |
| **Response Time** | Standard | Priority (faster inference) |
| **Human Approval** | ✅ Required | ✅ Required |
| **Gmail Integration** | ✅ | ✅ (with attachments) |

## Gmail/User Account Authentication Strategy

### Why This Approach is BRILLIANT:
1. **Avoids spam detection** — emails come from user's real Gmail
2. **Email thread ownership** — user can see all conversations in their Gmail
3. **Legal/ToS compliance** — AI is just "helping" user, not impersonating
4. **Trust & transparency** — recipient sees real user email, not bot

### Implementation:
```
User connects Gmail via OAuth 2.0
                    ↓
AI drafts cover letter + application
                    ↓
User reviews & approves in Applify UI
                    ↓
AI sends email VIA USER'S GMAIL (using Gmail API with user token)
                    ↓
Email appears in user's Sent folder
                    ↓
Responses go to user's inbox (visible in Applify + Gmail)
```

### For Job Platforms without Email:
- LinkedIn: AI opens form in user's browser session (LinkedIn auth)
- Jobstreet: AI fills form but user clicks final submit
- Greenhouse/Lever: If API available, use API with user's session

## OpenRouter Integration Code

```typescript
// services/openRouterService.ts
const FREE_MODELS = [
  'deepseek/deepseek-v4-flash:free',
  'qwen/qwen3-next-80b-a3b-instruct:free', 
  'google/gemma-4-31b-it:free',
  'arcee-ai/trinity-large-thinking:free'
];

const PAID_MODELS = {
  coverLetter: 'anthropic/claude-3.5-sonnet',
  analysis: 'openai/gpt-4o',
  fallback: 'deepseek/deepseek-chat'
};

export async function generateCoverLetter(
  profile: FullProfile, 
  job: JobData,
  tier: 'free' | 'pro'
): Promise<string> {
  const model = tier === 'pro' 
    ? PAID_MODELS.coverLetter 
    : 'openrouter/free'; // Auto-select best free model
  
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://applify.app',
      'X-Title': 'Applify AI Job Assistant'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_COVER_LETTER },
        { role: 'user', content: buildPrompt(profile, job) }
      ],
      temperature: tier === 'pro' ? 0.7 : 0.9, // Free more creative, Pro more precise
      max_tokens: 2000
    })
  });
  
  return response.json();
}
```

## Cost Estimation (Pro Tier)

| Operation | Tokens | Cost per Apply |
|-----------|--------|---------------|
| Job Analysis | 2K input + 500 output | ~$0.005 |
| Cover Letter | 3K input + 800 output | ~$0.015 |
| CV Optimization | 2K input + 600 output | ~$0.008 |
| Follow-up Email | 1K input + 400 output | ~$0.005 |
| **Total per Apply** | | **~$0.033** |
| **Daily (50 applies)** | | **~$1.65** |
| **Monthly (1,500 applies)** | | **~$49.50** |

**Break-even:** If Pro tier priced at $29-49/month, cost is covered at ~900 applies/month.

## Implementation Priority

1. **Phase 1:** Integrate OpenRouter with Free Models Router
2. **Phase 2:** Add Gmail OAuth for email-based applications
3. **Phase 3:** Implement tier-based model selection (free vs pro)
4. **Phase 4:** Add usage tracking and quota enforcement (10 vs 50/day)
5. **Phase 5:** A/B test acceptance rates between tiers
