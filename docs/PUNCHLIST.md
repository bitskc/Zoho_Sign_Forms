# 🎯 SignFlow Pro - QA Punchlist

**Generated:** 2026-01-12
**Status:** Production-ready with improvements needed
**Overall Assessment:** 72/100 (C+ / Passing)

---

## 🔴 CRITICAL - Do First (Week 1)

### 1. Add Error Tracking (2 hours)
**Why:** Catch production bugs before users report them
**Impact:** HIGH - Can't improve what you can't measure

```bash
npm install @sentry/react @sentry/vite-plugin
```

**Tasks:**
- [ ] Install Sentry
- [ ] Wrap App in Sentry ErrorBoundary
- [ ] Configure source maps in vite.config.ts
- [ ] Add SENTRY_DSN to Vercel env vars
- [ ] Test by throwing error in dev
- [ ] Deploy and verify errors appear in Sentry dashboard

**Files to modify:**
- `index.tsx` or `App.tsx` - wrap with `Sentry.init()`
- `vite.config.ts` - add Sentry plugin
- Vercel dashboard - add SENTRY_DSN env var

---

### 2. Add Health Check Endpoint (1 hour)
**Why:** Know when your app is down
**Impact:** HIGH - Currently blind to outages

**Tasks:**
- [ ] Create `/api/health.ts`
- [ ] Test Supabase connection
- [ ] Test environment variables are set (SUPABASE_URL, GEMINI_API_KEY, etc.)
- [ ] Return 200 if healthy, 503 if unhealthy
- [ ] Add to Vercel monitoring/uptime checks
- [ ] Document endpoint in README

**Example:**
```typescript
// api/health.ts
export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  const checks = {
    supabase: false,
    envVars: false,
  };

  try {
    // Test Supabase connection
    const { data, error } = await supabaseServer.from('forms').select('id').limit(1);
    checks.supabase = !error;

    // Check required env vars
    checks.envVars = !!(
      process.env.SUPABASE_SERVICE_ROLE &&
      process.env.GEMINI_API_KEY &&
      process.env.PUBLIC_URL
    );

    const healthy = checks.supabase && checks.envVars;

    return new Response(JSON.stringify({
      status: healthy ? 'healthy' : 'unhealthy',
      checks,
      timestamp: new Date().toISOString()
    }), {
      status: healthy ? 200 : 503,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      status: 'unhealthy',
      error: (error as Error).message
    }), { status: 503 });
  }
}
```

---

### 3. Add First E2E Test (4-6 hours)
**Why:** Catch breaking changes before deployment
**Impact:** HIGH - No integration tests currently

```bash
npm install -D @playwright/test
npx playwright install
```

**Tasks:**
- [ ] Install Playwright
- [ ] Create `tests/e2e/` directory
- [ ] Write test: User creates form → views public page
- [ ] Add to GitHub Actions CI workflow
- [ ] Document how to run tests locally

**Example test:**
```typescript
// tests/e2e/form-flow.spec.ts
import { test, expect } from '@playwright/test';

test('user can create form and view public page', async ({ page }) => {
  // 1. Sign up/login
  await page.goto('http://localhost:3000/#/admin');
  await page.fill('input[type="email"]', 'test@example.com');
  await page.fill('input[type="password"]', 'testpass123');
  await page.click('button:has-text("Sign Up")');

  // 2. Create form
  await page.click('button:has-text("New Form")');
  await page.fill('input[name="name"]', 'Test Form');
  await page.fill('input[name="slug"]', 'test-form');
  await page.fill('input[name="templateId"]', 'test-template-id');
  await page.click('button:has-text("Save")');

  // 3. Visit public page
  await page.goto('http://localhost:3000/test-form');
  await expect(page.locator('h1')).toContainText('Test Form');
});
```

**Files to modify:**
- Create `playwright.config.ts`
- Add to `.github/workflows/ci.yml`
- Update README with test instructions

---

## 🔴 CRITICAL - Security Audit (Week 2)

### 4. Verify Row-Level Security (RLS) Policies (1-2 days)
**Why:** Prevent users from accessing other users' data
**Impact:** CRITICAL - Data breach risk

**Tasks:**
- [ ] Review `supabase/migrations/20260111_forms_rls.sql`
- [ ] Verify policies exist for all tables (forms, form_qrcodes, form_analytics, user_credentials)
- [ ] Test: Try to access another user's form via API
- [ ] Test: Try to query another user's forms directly via Supabase client
- [ ] Test: Try to delete another user's form
- [ ] Document RLS policies in README or separate SECURITY.md

**Manual test:**
```bash
# In browser console on public form page:
const { data } = await supabase.from('forms').select('*');
// Should return empty or only public data, NOT all forms
```

---

### 5. Add CSRF Protection (1 day)
**Why:** Prevent cross-site request forgery attacks
**Impact:** HIGH - Currently vulnerable

**Tasks:**
- [ ] Research Vercel Edge + Supabase CSRF patterns
- [ ] Implement double-submit cookie pattern OR
- [ ] Verify Supabase auth tokens provide sufficient protection (document reasoning)
- [ ] Add `SameSite=Strict` to any custom cookies
- [ ] Test with CSRF attack simulation

**Note:** Supabase JWT tokens may provide sufficient protection. Research and document decision.

---

### 6. Add Content Security Policy (CSP) Headers (2-3 hours)
**Why:** Prevent XSS attacks and clickjacking
**Impact:** MEDIUM - Defense in depth

**Tasks:**
- [ ] Add CSP headers to `vercel.json`
- [ ] Test app still works (no console errors)
- [ ] Test QR code modal, Zoho Sign embed still work
- [ ] Add X-Frame-Options, X-Content-Type-Options

**Example:**
```json
// vercel.json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://sign.zoho.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-src https://sign.zoho.com;"
        },
        {
          "key": "X-Frame-Options",
          "value": "SAMEORIGIN"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        }
      ]
    }
  ]
}
```

---

### 7. Add Request Body Size Limits (1 hour)
**Why:** Prevent DoS via large payloads
**Impact:** MEDIUM - Memory exhaustion risk

**Tasks:**
- [ ] Add Content-Length validation to API endpoints
- [ ] Limit to 1MB for forms API
- [ ] Limit to 50KB for analytics API
- [ ] Return 413 Payload Too Large if exceeded
- [ ] Add test case for oversized request

**Example:**
```typescript
// api/forms.ts
export default async function handler(req: Request) {
  const contentLength = req.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > 1_000_000) {
    return new Response(JSON.stringify({ error: 'Payload too large' }), {
      status: 413
    });
  }
  // ... rest of handler
}
```

---

### 8. Encrypt OAuth Tokens at Rest (1 day)
**Why:** Database breach = OAuth credential exposure
**Impact:** HIGH - Zoho API access compromise

**Tasks:**
- [ ] Research Supabase encryption options (transparent column encryption)
- [ ] OR implement application-layer encryption for `user_credentials` table
- [ ] Rotate test tokens after implementing encryption
- [ ] Document encryption approach in SECURITY.md

**Options:**
- Supabase vault: https://supabase.com/docs/guides/database/vault
- Application-layer: Use `crypto.subtle.encrypt()` before storing

---

### 9. Audit Logging for Sensitive Data (2-3 hours)
**Why:** OAuth tokens/refresh tokens may leak in logs
**Impact:** MEDIUM - Credential exposure

**Tasks:**
- [ ] Audit all `logger.debug()`, `logger.info()` calls
- [ ] Ensure tokens are sanitized (already done in some places)
- [ ] Search codebase for `console.log` (should be none in production)
- [ ] Add test: Trigger error, verify logs don't contain secrets

```bash
# Search for potential issues
grep -r "console.log" --include="*.ts" --include="*.tsx" .
grep -r "refreshToken" --include="*.ts" --include="*.tsx" . | grep -v "sanitize"
```

---

## 🟡 HIGH PRIORITY - Performance Baseline (Week 3)

### 10. Add Lighthouse CI (1 day)
**Why:** Measure bundle size, performance budgets
**Impact:** MEDIUM - Prevent performance regressions

**Tasks:**
- [ ] Install `@lhci/cli`
- [ ] Configure lighthouserc.json
- [ ] Add to GitHub Actions CI
- [ ] Set budgets: < 200KB initial JS, TTI < 3s, Performance score > 90
- [ ] Document scores in README

```bash
npm install -D @lhci/cli
```

---

### 11. Add React Profiler Measurements (1-2 days)
**Why:** Identify actual bottlenecks in App.tsx
**Impact:** MEDIUM - Data-driven refactoring decisions

**Tasks:**
- [ ] Wrap App in React Profiler (dev mode only)
- [ ] Test common interactions (create form, edit landing page, view analytics)
- [ ] Measure render times and re-render counts
- [ ] Document findings - is App.tsx actually slow?
- [ ] Decide if refactoring is needed based on data

**Example:**
```typescript
// main.tsx (dev mode only)
import { Profiler } from 'react';

function onRenderCallback(
  id, phase, actualDuration, baseDuration, startTime, commitTime
) {
  console.log(`[Profiler] ${id} ${phase}`, { actualDuration, baseDuration });
}

<Profiler id="App" onRender={onRenderCallback}>
  <App />
</Profiler>
```

---

### 12. Add Request Timeouts (2-3 hours)
**Why:** Prevent slow external APIs from blocking requests
**Impact:** MEDIUM - Cascading failure prevention

**Tasks:**
- [ ] Add 10s timeout to Zoho API calls
- [ ] Add 5s timeout to Gemini API calls
- [ ] Add 5s timeout to QR API calls
- [ ] Return 504 Gateway Timeout if exceeded
- [ ] Test with slow API simulation

**Example:**
```typescript
// Use AbortController for fetch timeouts
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 10000);

try {
  const response = await fetch(url, { signal: controller.signal });
} catch (error) {
  if (error.name === 'AbortError') {
    return new Response(JSON.stringify({ error: 'Request timeout' }), {
      status: 504
    });
  }
}
```

---

### 13. Load Testing (1 day)
**Why:** Verify rate limiting and DB performance under load
**Impact:** MEDIUM - Scalability validation

**Tasks:**
- [ ] Install k6 or Artillery
- [ ] Test: 100 concurrent users fetching public forms
- [ ] Test: 50 req/sec to forms API (should hit rate limit)
- [ ] Test: Database connection pool under load
- [ ] Document results and bottlenecks

```bash
npm install -D artillery
```

---

## 🟢 MEDIUM PRIORITY - Documentation & Observability (Week 4+)

### 14. Rewrite README (2-3 hours)
**Why:** Current README is boilerplate, doesn't describe app
**Impact:** MEDIUM - Developer onboarding

**Tasks:**
- [ ] Replace AI Studio boilerplate
- [ ] Add project description (what is SignFlow Pro?)
- [ ] Add architecture overview
- [ ] Add setup instructions (Supabase, Zoho, Gemini setup)
- [ ] Add deployment guide
- [ ] Add troubleshooting section

---

### 15. Add API Documentation (3-4 hours)
**Why:** No docs for API endpoints
**Impact:** MEDIUM - Developer productivity

**Tasks:**
- [ ] Document all `/api/*` endpoints
- [ ] Add request/response examples
- [ ] Add error codes and meanings
- [ ] Consider OpenAPI/Swagger spec
- [ ] Add to README or separate API.md

---

### 16. Add Alerting (1 day)
**Why:** Know when production is broken
**Impact:** MEDIUM - Faster incident response

**Tasks:**
- [ ] Set up Sentry alerts (error rate > 5%)
- [ ] Set up Vercel alerts (deployment failures)
- [ ] Configure email/Slack notifications
- [ ] Document on-call process

---

### 17. Add Analytics Data Retention Policy (1 day)
**Why:** form_analytics table will grow indefinitely
**Impact:** MEDIUM - Storage costs, query performance

**Tasks:**
- [ ] Decide retention period (e.g., 90 days)
- [ ] Create Supabase cron job to archive old analytics
- [ ] OR create Vercel cron endpoint to cleanup
- [ ] Document policy in README

---

## 🟢 LOW PRIORITY - Code Quality (Backlog)

### 18. Add ESLint + Prettier (2 hours)
**Why:** Consistent code style
**Impact:** LOW - Quality of life

**Tasks:**
- [ ] Install ESLint + Prettier
- [ ] Configure rules (TypeScript, React)
- [ ] Add pre-commit hook (husky)
- [ ] Run on existing code (fix auto-fixable issues)

---

### 19. Extract Magic Numbers to Constants (1 day)
**Why:** Improve readability
**Impact:** LOW - Maintainability

**Tasks:**
- [ ] Find hardcoded values (125, 60, 4.5, etc.)
- [ ] Extract to named constants
- [ ] Add to constants.ts file

---

### 20. Add Code Comments for Complex Logic (1-2 days)
**Why:** OAuth flow and time window calculations are hard to follow
**Impact:** LOW - Developer onboarding

**Tasks:**
- [ ] Add comments to OAuth token exchange flow
- [ ] Add comments to analytics time window calculations
- [ ] Add JSDoc to public functions

---

## 📊 Decision Points

### After Week 3: Decide on App.tsx Refactoring
**Refactor IF:**
- [ ] React Profiler shows > 100ms render times
- [ ] Profiler shows > 3 re-renders per user action
- [ ] Development velocity is slowing (PRs blocked on App.tsx conflicts)
- [ ] New features are impossible without refactor

**Don't Refactor IF:**
- [ ] Performance is acceptable (< 100ms renders)
- [ ] Team is productive
- [ ] No user complaints

**If refactoring, do incrementally:**
1. Extract PublicFormPage first (lowest risk)
2. Extract context providers (auth, forms)
3. Extract hooks (useFormManagement, useAnalytics)
4. Test/deploy each step

---

## 🎯 30-Day Plan

| Week | Focus | Expected Outcome |
|------|-------|------------------|
| **Week 1** | Observability | Sentry + health check + 1 E2E test = visibility into production |
| **Week 2** | Security | RLS audit + CSRF + CSP + request limits = reduce attack surface |
| **Week 3** | Performance | Lighthouse + Profiler + load test = data on bottlenecks |
| **Week 4** | Review | Analyze data → decide on refactoring vs feature work |

---

## 📈 Success Metrics

**After 30 days, you should have:**
- [ ] 0 untracked production errors (all in Sentry)
- [ ] 99%+ uptime (monitored by health check)
- [ ] 1+ E2E test passing in CI
- [ ] Security audit complete (no critical findings)
- [ ] Performance baseline established (Lighthouse scores documented)
- [ ] Data-driven decision on App.tsx refactoring

---

## 🚫 What NOT to Do

- ❌ **Don't refactor App.tsx without data proving it's a problem**
- ❌ **Don't add features before fixing observability + security**
- ❌ **Don't skip E2E tests ("we'll add them later")**
- ❌ **Don't deploy to production without health check**
- ❌ **Don't ignore Sentry errors ("users haven't complained")**

---

## 📞 Questions or Blockers?

If stuck on any task:
1. Check if blocking issue is a missing dependency or environment var
2. Search Vercel/Supabase docs for edge runtime specifics
3. Test in local dev before deploying to production
4. Deploy to staging first (if you add one)

---

**Last Updated:** 2026-01-12
**Next Review:** After Week 4 (2026-02-09)

---

## Appendix: Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Production errors go unnoticed | HIGH | HIGH | **Task #1: Add Sentry** |
| Security breach (RLS bypass) | MEDIUM | CRITICAL | **Task #4: Audit RLS** |
| DoS via large payloads | MEDIUM | HIGH | **Task #7: Request limits** |
| Slow external API cascades | MEDIUM | MEDIUM | **Task #12: Timeouts** |
| OAuth token leak | LOW | HIGH | **Task #8: Encrypt tokens** |
| App.tsx refactor breaks features | HIGH (if done) | HIGH | **Don't refactor without E2E tests** |

**Overall Risk Level:** MEDIUM (manageable with Tasks #1-9)
