# SignFlow App Remediation PRD

**Status:** Department-reviewed; approved with required defaults and release gates below  
**Created:** 2026-05-15  
**Primary goal:** Make SignFlow fast, reliable, accessible, and production-maintainable without changing the core product model.  
**Implementation target:** Codex 5.3 or equivalent coding agent working in small PRs.

---

## 1. Executive Summary

SignFlow is functionally back online, but the current app has clear production-quality issues:

- Public signing pages take too long to load.
- Admin dashboard startup does unnecessary network work and intentionally waits during QR generation.
- The frontend ships as one large JavaScript bundle to every visitor, including public signers.
- Several API endpoints fetch more data than needed and perform client/server-side aggregation inefficiently.
- Some failed operations are silent or misleading, which makes the app feel unreliable.
- The admin UI is not using an industry-standard SaaS layout pattern. It currently feels unusual because form creation, form cards, details, settings, QR, analytics, credentials, and billing are visually mixed rather than organized into a predictable app shell.
- Accessibility and mobile issues prevent a polished, trustworthy user experience.

This PRD converts the QA audit into implementable work. It is intentionally explicit so an implementation agent can pick up each phase and complete it without re-discovering the problem.

---

## 1A. Primary Users and Journeys

### Primary Users

- Public signer: a customer's end user who opens a public signing URL or scans a QR code, reviews the branded form page, submits required contact fields, and continues to Zoho embedded signing.
- Form admin: a signed-in SignFlow user who creates and manages forms, configures landing page branding, generates QR codes, and reviews analytics.
- Account/billing admin: a signed-in SignFlow user who manages Zoho credentials, subscription status, billing actions, and account settings.

### Critical Journeys

1. Public signer opens a slug URL such as `/fbmc`, sees either a neutral loading skeleton or the correct customer-branded signing page, enters required information, submits, and receives the Zoho embedded signing URL without seeing admin UI or generic fallback branding.
2. Public signer scans a QR code, lands on the correct public signing page, and completes the same signing flow.
3. Form admin logs in, reaches the Forms section, sees existing forms without waiting for analytics or QR generation, and can open a form details page.
4. Form admin creates or edits a form, configures Zoho template fields and landing-page branding, saves successfully, and receives visible error feedback on failure.
5. Form admin opens a form's QR Code section, generates or views the QR code on demand, and can verify the public URL.
6. Form admin opens Analytics for a form and loads analytics on demand with clear loading, empty, and error states.
7. Account/billing admin opens Zoho Connection, views connection status, saves credentials, retries failures, and does not see silent default data.
8. Account/billing admin opens Subscription/Billing and cannot accidentally change billing-affecting status without explicit confirmation.

---

## 2. Goals

1. Reduce public signing page time-to-interactive and perceived load time.
2. Reduce admin dashboard initial load time by removing avoidable request waterfalls and background work from the critical path.
3. Improve API response time for hot public paths: form lookup, QR redirect, and Zoho signing submission.
4. Add browser/CDN caching for static assets while preventing stale SPA shell issues.
5. Fix silent error states and dangerous UI actions.
6. Redesign the admin experience around a standard responsive SaaS sidebar layout.
7. Resolve known WCAG failures and target WCAG 2.2 AA for public signing and authenticated admin flows.
8. Improve maintainability enough that future changes are safer.

---

## 3. Non-Goals

- Do not redesign the product from scratch.
- Do not replace Supabase, Vercel, Zoho Sign, or React.
- Do not introduce a full design system package unless necessary.
- Do not rewrite `App.tsx` wholesale in one PR. Split only where it directly improves performance or clarity.
- Do not change user-facing pricing, subscription plans, or business logic unless explicitly listed below.

---

## 4. Current State Summary

### 4.1 Public Signing Page Problems

Public signing pages are the highest-priority experience. They are reached by customers' end users and QR-code scanners. Current issues:

- Every public signer downloads the full admin application bundle.
- Public form fetch has no clear personalized loading skeleton.
- Public form pages currently render a generic fallback theme before the customer form config is loaded. On `https://www.signflow.ink/fbmc`, this appears as a late style/theme application: the page initially renders default SignFlow styling, then swaps to Farrell Brothers Marine branding after `/api/forms?slug=fbmc` returns.
- Customer branding should never appear to "pop in" after several seconds. Either the branded config must be available before rendering the form card, or a neutral skeleton/loading shell must be shown until the config is ready.
- Public form lookup depends on database query performance and missing indexes may cause full scans.
- Public submit path refreshes Zoho OAuth access tokens on every request.
- Public submit path performs many sequential network calls before returning the embedded signing URL.
- Analytics tracking may add additional request overhead.

### 4.2 Admin Dashboard Problems

- `fetchForms` triggers per-form analytics requests.
- `fetchForms` triggers per-form QR generation requests.
- QR generation currently has a hardcoded 500ms delay per batch.
- Login fetches forms, credentials, and subscription sequentially.
- Forms list fetches full QR PNG blobs for every form.
- The dashboard is one large component and re-renders more than necessary.

### 4.3 API Problems

- Several private endpoints lack `Cache-Control: private, no-store`.
- Hot queries may be missing indexes.
- Analytics aggregate query fetches all rows and counts in JavaScript.
- Rate limiting is in-memory and has an incorrect JWT-derived key.
- Several endpoints lack JSON parse guards and top-level try/catch handling.

### 4.4 UX/A11y Problems

- Some loading states are absent or inaccessible.
- Some errors are swallowed silently.
- Some destructive or billing-affecting actions have no confirmation.
- Many controls lack accessible labels.
- Landing page has multiple `<h1>` elements.
- Mobile spacing and tap targets are inconsistent.

### 4.5 Admin UI Architecture Problems

The current admin UI does not match the layout expectations of a modern SaaS dashboard:

- There is no persistent desktop sidebar for primary navigation.
- Navigation appears as top-row buttons and view-specific controls, which makes the product feel ad hoc.
- The dashboard combines create/edit form controls and form list content in a way that does not scale.
- Settings, credentials, billing/subscription, QR, and analytics are nested inside form details or mixed into large panels rather than grouped into predictable sections.
- Form details use tabs, but the surrounding layout does not clearly communicate hierarchy.
- There is no clear app shell with product branding, account controls, current section, and main content region.
- Mobile behavior is stacked rather than intentionally designed around a drawer, bottom actions, or responsive navigation.
- The visual language is inconsistent: primary buttons use different colors, headings use inconsistent weights, badges use arbitrary text sizes, and spacing is irregular.

The remediation must treat UI/UX as a product-level restructure, not just a set of small accessibility fixes.

---

## 5. Success Metrics

These are target outcomes. Use local build output, Vercel preview, browser DevTools, and production logs where available.

### 5.1 Public Signing Pages

- Public signing route downloads no admin-only QR modal code on first load.
- Public signing route does not download the full Supabase/admin dashboard code unless needed for shared app bootstrapping.
- Public signing page shows a meaningful loading/skeleton state within 500ms on a throttled network.
- Public signing page does not render a generic fallback form that later restyles into customer branding.
- Public signing page is interactive within 2 seconds on Fast 3G in Chrome DevTools for a warm CDN cache.
- `/api/forms?slug=<slug>` returns in under 300ms p95 once DB indexes are present, excluding cold starts.
- Public submit endpoint avoids unnecessary Zoho OAuth refreshes by caching access tokens.
- Public signing page meets Core Web Vitals targets in production field data where available: LCP <= 2.5s p75, INP <= 200ms p75, CLS <= 0.1 p75 on mobile.
- Public signing page has TTFB <= 800ms p75 and `/api/forms?slug=<slug>` p95 <= 300ms excluding cold starts.
- Public signing page initial JavaScript loaded on first render is below the agreed budget, initially target <= 170KB gzip excluding browser cache hits.
- Public signing route production error rate remains below 1% for page load/API lookup failures.

### 5.2 Admin Dashboard

- Login path fetches forms, credentials, and subscription concurrently.
- Dashboard initial render is not blocked by analytics loading or QR generation.
- Forms list response excludes full QR image data by default.
- Dashboard shows a usable shell within 2 seconds on Fast 3G for warm CDN cache.

### 5.3 Bundle and Caching

- Vite output has separate vendor chunks for React, Supabase, and QR functionality.
- Content-hashed `/assets/*` responses include `Cache-Control: public, max-age=31536000, immutable`.
- SPA shell routes return `Cache-Control: no-cache, no-store, must-revalidate` or an equivalent safe policy.
- Production source maps remain disabled unless intentionally configured for private error tracking.
- Build output records gzip/brotli sizes for public, admin, React vendor, Supabase vendor, and QR chunks.
- Public signing route network trace confirms no admin dashboard, analytics tab, subscription, credentials, or QR modal chunks are loaded before user interaction.
- Cache validation includes response headers and Vercel cache status for `/assets/*`, HTML shell routes, public form metadata, and QR redirects.

### 5.4 Reliability and Accessibility

- Failed save/delete/credential/subscription operations surface user-visible errors.
- WCAG Level A label failures from this document are fixed, and public signing/authenticated admin flows target WCAG 2.2 AA for text contrast, labels, focus visibility, and keyboard operation.
- Keyboard navigation remains intact for dashboard cards, tabs, modals, and public forms.
- `npm run build` and the existing test suite pass after every phase.

### 5.5 Admin UI/UX

- Desktop admin uses a standard SaaS app shell with persistent left sidebar navigation and a main content area.
- Mobile admin uses an intentional responsive navigation pattern: hamburger drawer or equivalent, not just wrapped desktop buttons.
- Primary admin sections are easy to understand without training:
  - Dashboard / Forms
  - Create Form
  - Credentials / Zoho Connection
  - Subscription / Billing
  - Settings
- Form details have a clear page hierarchy and predictable tabs or sub-navigation.
- Primary actions use one consistent visual style.
- Destructive actions use a consistent danger style and confirmation pattern.
- Empty states include clear next actions.
- The app looks credible as a paid SaaS product on desktop and mobile.

### 5.6 Journey Success Criteria

- A first-time public signer can complete the signing handoff without seeing generic SignFlow fallback branding on a customer-branded page.
- A signed-in admin can find Forms, Create Form, Zoho Connection, Subscription/Billing, and Settings within one navigation action from the admin shell.
- A signed-in admin can refresh a browser page and remain in the expected admin section or form detail view when the current routing model supports it.
- Every critical journey has visible loading, empty, error, and success states where applicable.

---

## 6. Implementation Principles

1. Ship in small PRs. Each phase below can be one PR or split further.
2. Preserve behavior unless a behavior is explicitly identified as broken or dangerous.
3. Prefer removing work from critical paths over adding spinners.
4. Avoid speculative abstractions. Extract components only when they reduce bundle size, render work, or risk.
5. For public signing pages, prioritize perceived speed and minimal first-load code.
6. Add tests where existing test structure makes it practical. Do not block obvious fixes on large test harness rewrites.

---

## 6A. Release Readiness Principles

1. No remediation PR is release-ready without automated test results, manual QA notes, and rollback notes.
2. Public signing regressions are release blockers.
3. Admin authorization regressions are release blockers.
4. Credential, token, subscription, and signer data leakage are release blockers.
5. Performance improvements must not reduce accessibility, security, or reliability.
6. Subjective UI acceptance criteria must be backed by screenshots at desktop, tablet, and 320px mobile widths.

---

## 6B. Virtual Department Review Status

This PRD was reviewed from five department perspectives. Initial verdict from every department was **Approved with changes**. The blocking changes were incorporated into this document, then a final approval pass was completed.

| Department | Final Status | Required Additions Incorporated |
|---|---|---|
| Product + UX | Approved | User journeys, admin IA/routing, concrete visual standards, mobile drawer behavior, PR dependencies |
| Frontend Engineering | Approved | Public/admin import boundaries, dynamic imports, admin shell incremental rollout, accessibility keyboard details, test targets |
| Backend + Data | Approved with non-blocking notes | Public response allowlist, API contracts, migration safety, Zoho token cache design, analytics RPC contract, rate-limit requirements |
| DevOps + Performance | Approved with non-blocking notes | Web Vitals budgets, observability baseline, cache validation, bundle verification, deployment safety and rollback gates |
| QA + Security + Accessibility | Approved with non-blocking notes | Release gates, automated/manual QA matrices, cross-user authorization checks, privacy controls, WCAG 2.2 AA target for critical flows |

Final approval condition: implementation may proceed using the defaults and release gates in sections 18A, 18B, 18C, 20A, and 21. Any owner override must be documented in the relevant PR.

Former non-blocking owner decisions have been resolved as implementation defaults in section 21. A product owner may override them before the relevant PR starts, but implementation should proceed with the documented defaults unless an override is explicitly recorded in the PR.

---

## 7. Phase 0: Measurement and Guardrails

**Goal:** Establish basic performance and regression visibility before major changes.

### 7.1 Tasks

- Add a lightweight performance checklist to PR descriptions for remediation PRs.
- Add manual QA scripts or docs for:
  - Public signing page by slug.
  - Admin login to dashboard.
  - QR redirect flow.
  - Form create/edit/delete.
  - Public form submit to Zoho embedded signing URL.
- Add or update E2E tests if Playwright is already available in the repo. If not, document manual steps and defer installation to a separate PR.

### 7.2 Acceptance Criteria

- A regression QA matrix exists for public signing, admin flows, auth/session behavior, API error handling, billing/subscription, QR flows, and accessibility.
- The matrix includes desktop and mobile coverage, at minimum: Chrome desktop, Safari iOS, and Android Chrome.
- Each remediation PR template requires:
  - test commands run,
  - manual QA steps completed,
  - screenshots or recordings for UI changes,
  - performance evidence for performance changes,
  - security/privacy notes for API/auth/token/cache changes,
  - rollback notes.
- Existing tests still pass.
- No product behavior changes in this phase unless incidental docs-only changes are made.

### 7.3 Notes for Codex

- Check current `package.json` before adding Playwright. Do not add it if the repo intentionally removed it.
- Prefer docs/manual QA in this phase unless test infrastructure is already present.

### 7.4 Production Measurement and Observability Baseline

#### Tasks

- Add lightweight Web Vitals reporting for public signing pages and admin dashboard routes.
- Capture route name, metric name, value, rating, navigation type, and deployment/version identifier.
- Add structured server logs for API routes with request ID, route, status, duration, cache outcome where available, and safe error category.
- Add timing logs for Zoho OAuth refresh, Zoho submit/embed-token calls, Supabase form lookup, QR redirect lookup, and analytics aggregation.
- Ensure logs never include access tokens, refresh tokens, PII-heavy request bodies, raw signer data, or raw third-party error bodies.
- Define where production metrics are viewed: Vercel Analytics, custom endpoint/table, Sentry, Logtail, Datadog, or another approved tool.

#### Acceptance Criteria

- Public signing page and admin dashboard emit Web Vitals in production or a documented preview-equivalent environment.
- API logs can answer: which route is slow, whether the request was cached, which dependency was slow, and whether failures are increasing.
- Each remediation PR includes before/after numbers when it changes performance-sensitive code.

---

## 8. Phase 1: Public Signing Page Performance

**Goal:** Fix the most important user-facing slowness: public signing pages.

### 8.1 Split Public Signing Code from Admin Code

Current problem: public signers download the same large app bundle as admins.

#### Tasks

- Extract the public signing page render branch from `App.tsx` into a separate component, for example `components/PublicFormPage.tsx`.
- Lazy-load admin-only modules where practical.
- Ensure `QRCodeModal` and QR rendering dependencies are not loaded on public signing pages unless the admin QR modal opens.
- Public-route code must not statically import authenticated admin views, QR modal code, QR rendering libraries, analytics panels, subscription panels, or credentials panels.
- Use dynamic imports/`React.lazy` for admin-only views and QR-heavy components where needed so they are not part of the public signing route's initial module graph.
- Add a public-route `Suspense` fallback that uses the neutral public loading skeleton, not the generic final form UI.
- After extraction, data ownership must be explicit:
  - public form lookup/loading/error/retry state belongs to `PublicFormPage` or a small public-only hook;
  - authenticated admin state remains outside the public route bundle where practical.
- Consider route-level lazy loading:
  - Public form page.
  - Admin dashboard.
  - Landing/marketing page.
- Keep routing behavior unchanged.

#### Acceptance Criteria

- Public form route still works for slug URLs and subdomain routes.
- Public form route initial chunk excludes QR modal code.
- `npm run build` shows at least one separate QR/admin chunk or clear manual chunks in Vite output.
- Vite build output and browser Network checks confirm admin dashboard, QR modal, QR libraries, analytics, credentials, and subscription chunks are not requested before an authenticated/admin interaction requires them.
- Public form route has no visible regression in copy, branding, or submit behavior.

### 8.2 Add Public Form Loading Skeleton

Current problem: public form fetch can be slow and the page appears partially loaded or blank.

Specific live example: `https://www.signflow.ink/fbmc` initially renders a generic public form using fallback colors/content, then applies the Farrell Brothers Marine logo, colors, headline, and description only after the API response arrives. Users perceive this as CSS/styling loading 5 seconds late.

#### Tasks

- Do not render the final public form card with fallback/default theme while `currentForm` is still null for a valid public slug.
- Use `isFormLoading` to render a neutral, polished skeleton for public form pages until form config is available.
- Skeleton must preserve layout to avoid layout shift.
- Show headline/slug fallback only inside a loading/skeleton context, not as the final styled form.
- Once `currentForm` arrives, render the customer-branded form once with the correct logo, colors, headline, description, button text, footer, and contact fields.
- Add accessible loading semantics: `role="status"`, `aria-live="polite"`.

#### Acceptance Criteria

- On slow network, public signing page shows an immediate neutral loading state, not a generic SignFlow form that later restyles.
- On `www.signflow.ink/fbmc`, Farrell Brothers Marine branding appears on the first real form render without a visible generic-to-branded swap.
- Loading state is accessible to screen readers.
- If form fetch fails, a visible error appears with a clear retry action or support instruction.

### 8.3 Optimize Public Form Lookup API

Current problem: public form lookup may scan or fetch too much data.

#### Tasks

- Ensure `/api/forms?slug=<slug>` selects only fields needed by public page:
  - form ID
  - slug
  - display name
  - landing config
  - QR stable ID if needed
- Do not include QR image blobs in public lookup unless required.
- Public lookup must not expose Zoho implementation details unless there is a documented client-side requirement.
- Do not return `template_id`, `role_name`, `api_domain`, refresh tokens, access tokens, credential IDs, owner IDs, subscription data, private analytics, or private QR image blobs from public lookup.
- Public submit should send a public identifier such as `slug` or `form_id`; the server must resolve Zoho template/domain/role data internally.
- Define the public response contract explicitly:
  - `id`
  - `slug`
  - `display_name`
  - `landing_config`
  - public QR metadata only if required
  - no private owner or Zoho credential fields
- Keep existing public cache policy if safe: `public, s-maxage=60, stale-while-revalidate=300`.
- Keep public form metadata cache where safe, but define accepted staleness after customer edits. Default policy: `public, s-maxage=60, stale-while-revalidate=300` only if branding/config changes may take up to 5 minutes to fully refresh globally.
- If near-immediate branding updates are required, add cache versioning, tag/path purge, or reduce SWR for public form metadata.
- Add or verify DB index on `forms.slug` if not already present.

#### Acceptance Criteria

- Public lookup response payload is minimal.
- Public lookup response is reviewed for data exposure and contains no private Zoho credential/configuration fields.
- Existing public slug behavior remains unchanged.
- Cache headers remain appropriate for public form metadata.

### 8.3A Optional Follow-Up: Server/Edge-Rendered Public Signing Shell

Current SPA behavior means customer-specific styling is not known until the browser downloads JavaScript, executes React, and fetches `/api/forms?slug=<slug>`. A skeleton avoids the bad generic-to-branded swap, but the best production UX is to make public signing pages arrive with the customer theme already in the HTML.

This section is not required for PR 1 unless explicitly selected. If not implemented, PR 1 acceptance is satisfied by the neutral skeleton, no generic-to-branded final form flash, and no duplicate unnecessary public lookup work.

#### Tasks

- Evaluate adding a Vercel route/function for public slug pages that returns an HTML shell with:
  - inline critical CSS variables for the form theme,
  - form headline/description/logo metadata,
  - a small serialized bootstrap payload such as `window.__SIGNFLOW_PUBLIC_FORM__`,
  - the normal Vite JS/CSS assets for hydration.
- Use the existing static SPA shell for admin and marketing routes unless public shell routing is implemented safely.
- Ensure the edge/server-rendered shell still respects public cache policy and invalidation expectations.
- If full server-rendered shell is too large for the first performance PR, ship the neutral skeleton first and track this as the follow-up.
- Server/edge-rendered HTML must escape serialized bootstrap JSON safely to prevent script injection.
- Bootstrap data must use the same public-safe field allowlist as `/api/forms?slug=<slug>`.
- Define cache invalidation behavior when a form's branding, slug, active status, or landing config changes.
- If inline CSS variables or serialized payloads are used, verify CSP compatibility.
- The implementation must avoid duplicate client lookup when bootstrap data is present, valid, and generated from the current slug.

#### Acceptance Criteria

- On `www.signflow.ink/fbmc`, the first meaningful form render already uses Farrell Brothers Marine colors/content without waiting for client-side React fetch.
- The client does not need to make a duplicate public form lookup if bootstrap data is present and fresh enough.
- If bootstrap data is unavailable, the client falls back to the neutral skeleton and normal `/api/forms?slug=<slug>` fetch.
- Public slug pages remain cacheable without leaking private data.
- Public slug HTML cache policy is explicitly defined. If the shell contains only public branding/config, it may use CDN caching with bounded staleness; if it could include private/user-specific data, it must be `private, no-store`.
- The implementation documents how public shell cache is invalidated or allowed to expire after form branding/config edits.

### 8.4 Add Missing Hot Path Indexes

Current problem: QR scans and signing pages may hit full table scans.

#### Tasks

- Create a Supabase migration adding indexes if they do not already exist:
  - `forms(slug)` if missing.
  - `forms(template_id)`.
  - `forms(qr_stable_id)`.
  - `form_qrcodes(form_id)`.
  - `form_analytics(form_id, created_at)` or separate indexes as query plans require.
- Use `CREATE INDEX IF NOT EXISTS`.
- Name indexes clearly.
- Before adding a unique index on `forms.slug`, check for duplicate or null slugs and document remediation.
- Prefer a unique index for public slugs if product rules require global slug uniqueness.
- Confirm whether Supabase migrations run inside transactions before using `CREATE INDEX CONCURRENTLY`; if unavailable, assess lock risk for production table size.
- Add query-plan verification for:
  - public form lookup by slug
  - QR redirect lookup by `qr_stable_id`
  - analytics lookup by `form_id` and `created_at`

#### Acceptance Criteria

- Migration is idempotent.
- Migration includes notes on lock risk, duplicate data assumptions, and rollback strategy.
- Hot path queries have matching indexes.
- Hot-path query plans use the intended indexes.
- Existing migrations/tests pass.

---

## 9. Phase 2: Admin Dashboard Load Performance

**Goal:** Make dashboard startup fast and non-blocking.

### 9.1 Parallelize Login Data Fetches

Current problem: login fetches forms, credentials, and subscription sequentially.

#### Tasks

- Replace sequential awaits after successful auth with `Promise.allSettled` or `Promise.all`.
- Prefer `Promise.allSettled` if one failure should not block the entire dashboard.
- Surface individual errors in the relevant panel.

#### Acceptance Criteria

- Login no longer waits for three serial network round-trips.
- If credentials fetch fails, dashboard can still load forms and shows a credentials warning.
- If subscription fetch fails, dashboard can still load forms and shows a subscription warning.

### 9.2 Remove Analytics N+1 from Critical Path

Current problem: `fetchForms` fires one analytics request per form.

#### Tasks

- Remove automatic per-form analytics fetch from `fetchForms`.
- Load analytics only when:
  - user opens a form details analytics tab, or
  - dashboard needs a small summary and a batch endpoint exists.
- If dashboard summary is required, implement `GET /api/analytics?formIds=id1,id2` returning compact summaries.

#### Acceptance Criteria

- Fetching forms does not trigger N analytics requests.
- Analytics tab still loads data on demand.
- No duplicate analytics fetches for the same form in one session.

### 9.3 Remove QR Generation from Login Critical Path

Current problem: `fetchForms` generates missing QR codes in batches with artificial delays.

#### Tasks

- Stop generating QR codes inside `fetchForms`.
- Generate QR codes only when:
  - user opens QR tab,
  - user clicks Generate QR Code,
  - or a non-blocking background job is explicitly started after dashboard is interactive.
- Remove the hardcoded `await new Promise(resolve => setTimeout(resolve, 500))` delay from the dashboard critical path.
- If background generation remains, ensure it does not block route resolution or dashboard rendering.

#### Acceptance Criteria

- Dashboard can render before any QR generation begins.
- Missing QR codes show a clear on-demand generate state.
- No 500ms artificial delay occurs during login/dashboard initialization.

### 9.4 Reduce Forms List Payload

Current problem: authenticated forms list fetches full QR PNG blobs for every form.

#### Tasks

- Modify authenticated `GET /api/forms` list path to exclude `qr_code_data` by default.
- Return compact QR metadata only:
  - `stable_id`
  - `created_at`
  - maybe `updated_at`
- Fetch QR image data from `/api/qrcodes?formId=<id>` only when QR tab/modal requires it.
- Add pagination or a reasonable limit to forms list if product allows. If pagination is too large for this phase, add a documented TODO and at least avoid blobs.

#### Acceptance Criteria

- Forms list response is significantly smaller.
- Existing form cards still render.
- QR code tab/modal still works by fetching QR data on demand.

---

## 10. Phase 3: API Performance and Reliability

**Goal:** Make API paths faster, safer, and more predictable.

### 10.1 Cache Zoho OAuth Access Tokens

Current problem: every sign request refreshes Zoho OAuth access token.

#### Tasks

- Implement DB-backed token caching unless an approved durable cache is selected before implementation.
- Add encrypted columns to `user_credentials`:
  - `access_token_encrypted`
  - `access_token_expires_at`
  - `access_token_updated_at`
- Reuse the existing credential encryption mechanism and server-only encryption key.
- Never expose cached access tokens to the frontend, logs, analytics, or API responses.
- On sign request:
  - If cached token exists and expires more than 5 minutes in the future, reuse it.
  - Otherwise refresh via Zoho OAuth.
  - Persist refreshed access token and expiry.
- Use a refresh guard:
  - Prefer a Postgres advisory lock or atomic compare/update around token refresh.
  - If lock acquisition fails, re-read the credential row before performing another refresh.
- Treat tokens expiring within 5 minutes as expired.
- If refresh fails and an existing token is still valid, use the existing token; otherwise return a safe structured error.
- Add timeout and retry with short backoff for Zoho OAuth fetch.

#### Acceptance Criteria

- Normal public sign submissions do not call Zoho OAuth on every request.
- Expired tokens refresh automatically.
- Concurrent sign submissions for the same user do not repeatedly refresh if one refresh succeeds.
- Credentials remain encrypted at rest.

### 10.2 Parallelize Independent API Work

#### Tasks

- `api/analytics.ts`: run summary and recent-events queries concurrently.
- `api/qrcodes.ts`: run form ownership lookup and existing QR lookup concurrently when safe.
- `api/zoho.ts`: parallelize auth token validation and form lookup where safe.

#### Acceptance Criteria

- API behavior unchanged.
- Independent queries use `Promise.all` or `Promise.allSettled` where appropriate.
- Errors remain handled and logged.

### 10.3 Fix Analytics Aggregation

Current problem: analytics summary fetches all rows and counts in JavaScript.

#### Tasks

- Replace unbounded row fetch with server-side aggregation.
- Preferred: create a Postgres RPC function that groups by `event_type` for a given `form_id` and time window.
- Alternative: separate Supabase count queries per event type, run concurrently, if RPC is too large for this phase.
- Preserve existing response shape expected by the frontend.
- Define the aggregation RPC contract before implementation:
  - input: `p_form_id uuid`, `p_start timestamptz`, `p_end timestamptz`
  - output: `event_type text`, `event_count bigint`
- RPC must enforce that the requesting user owns the form, either through RLS-safe queries or explicit ownership checks.
- Preserve the existing frontend response shape in the API layer.
- Validate allowed event types and time windows.
- Recent events must be limited and ordered by `created_at desc`.

#### Acceptance Criteria

- Analytics summary no longer transfers all matching rows.
- Recent events still return at most 20 rows.
- Existing analytics UI continues to work.

### 10.4 Add Cache-Control Headers to API Responses

#### Tasks

- Add `Cache-Control: private, no-store` to authenticated/private endpoints:
  - `api/analytics.ts` authenticated GET.
  - `api/credentials.ts` GET and mutation responses.
  - `api/forms.ts` authenticated list/mutation responses.
  - `api/qrcodes.ts` responses.
  - `api/subscription.ts` responses.
  - Stripe checkout/portal session URL responses.
- Add `Cache-Control: no-store` or `no-cache` to QR redirects unless product explicitly wants long-lived redirect caching.
- Keep public form metadata cache where safe.

#### Acceptance Criteria

- Private user data cannot be cached by shared proxies.
- Private/admin/credential/subscription data is not cacheable by shared proxies.
- Public metadata remains cacheable for fast signing pages.
- Public cacheable responses contain only public allowlisted fields.

### 10.5 Harden Error Handling

#### Tasks

- Guard `req.json()` in API routes and return 400 for malformed JSON.
- Add top-level try/catch where missing:
  - `api/qr-redirect.ts`.
  - `api/subscription.ts` auth path.
  - Any route with unguarded network or DB operations.
- Avoid returning raw third-party response bodies to clients in `api/zoho.ts`.
- Log embed token failures with `console.warn` while preserving fallback behavior.

#### Acceptance Criteria

- Malformed JSON returns clean 400.
- Unexpected backend errors return structured JSON and safe status codes.
- Sensitive third-party raw responses are not forwarded to clients.

### 10.6 Fix Rate Limiting

Current problem: in-memory limiter is per-process and JWT key is wrong.

#### Tasks

- Fix authenticated rate limit key derivation.
  - Do not use `token.slice(0, 20)`.
  - Decode JWT payload safely or resolve user ID through auth helper where feasible.
- For production-grade distributed limiting, use durable shared storage if available:
  - Upstash Redis.
  - Supabase table with careful pruning.
  - Vercel KV if enabled.
- If durable storage is not available, document limitation clearly and at least fix the shared JWT-prefix bug.
- Define per-endpoint limits before implementation:
  - public form lookup
  - public Zoho submit
  - QR redirect
  - authenticated analytics
  - authenticated form mutations
  - credential/subscription mutations
- Public limits should key by normalized client IP plus route-specific identifier where appropriate, such as slug, form ID, or QR stable ID.
- Authenticated limits should key by verified Supabase user ID.
- Do not key limits by raw JWT prefixes.
- Document trusted proxy/header behavior on Vercel.
- Define whether limiter failures fail open or fail closed.
- Production public submit and QR redirect limits require durable shared storage unless explicitly waived.

#### Acceptance Criteria

- Authenticated users do not share one global rate-limit bucket.
- Public endpoints remain protected by IP plus route-specific keys where no authenticated user exists.
- Rate limits are defined per endpoint category: public form lookup, public Zoho submit, QR redirect, authenticated mutations, analytics reads, and credential/subscription mutations.
- Limit-exceeded responses return 429 with safe JSON and no sensitive details.
- Rate-limit events are logged without PII or tokens.
- Limiter behavior and production storage limitations are documented.
- If distributed limiting is deferred, release notes explicitly call out the residual serverless multi-instance limitation.

### 10.7 Auth, Authorization, and Privacy Regression Requirements

#### Tasks

- Verify every authenticated API route resolves the current user from a trusted auth helper or verified JWT.
- Verify users cannot read, update, delete, generate QR codes for, or view analytics for forms owned by another user.
- Verify subscription and credential endpoints are scoped to the authenticated user only.
- Verify public endpoints expose only public form metadata needed for signing.
- Ensure logs never include Zoho refresh tokens, access tokens, embedded signing URLs if sensitive, credential payloads, signer PII, or raw third-party error bodies.
- Ensure private data is not stored in localStorage unless already approved and documented.
- Add regression tests or manual QA steps for cross-user access attempts.

#### Acceptance Criteria

- Cross-user access attempts return 401 or 403 and do not leak object existence unless intentionally allowed.
- Public form lookup does not expose credentials, owner email, subscription data, internal IDs not needed by the public flow, QR image blobs, or private analytics.
- Credential and token values are redacted from logs and API responses.
- Expired, malformed, missing, and wrong-user auth tokens are covered by tests or documented manual QA.

### 10.8 API Contract Requirements

For each changed API endpoint, document:

- method and path
- auth requirement
- request query/body schema
- response schema
- error response shape
- status codes
- cache-control header
- rate-limit behavior
- fields intentionally excluded for privacy

---

## 11. Phase 4: Bundle, CDN, and Asset Optimization

**Goal:** Reduce repeated downloads and make deployments cache-safe.

### 11.1 Configure Vite Manual Chunks

#### Tasks

- Add `build` config to `vite.config.ts`:
  - `target: 'es2022'`.
  - `sourcemap: false`.
  - `cssCodeSplit: true`.
  - `rollupOptions.output.manualChunks` for React, Supabase, and QR dependencies.
- Verify chunk output after `npm run build`.

#### Suggested Chunk Groups

```ts
manualChunks: {
  'vendor-react': ['react', 'react-dom'],
  'vendor-supabase': ['@supabase/supabase-js'],
  'vendor-qr': ['qrcode.react', 'qrcode'],
}
```

#### Acceptance Criteria

- Build outputs multiple cacheable chunks.
- Public signing page does not eagerly load QR modal chunk.
- Bundle warnings are understood and documented if they remain.
- Public route loaded JS, gzip/brotli sizes, and request count are recorded before and after the change.
- A bundle analyzer or Vite visualizer output is attached to the PR or summarized in the PR description.
- Manual chunks do not replace route-level lazy loading; public/admin/QR code paths must be dynamically separated where needed.

### 11.2 Add Vercel Static Asset Caching

#### Tasks

- Add header rule before catch-all security headers:

```json
{
  "source": "/assets/(.*)",
  "headers": [
    {
      "key": "Cache-Control",
      "value": "public, max-age=31536000, immutable"
    }
  ]
}
```

- Define separate cache policies:
  - Hashed static assets: `Cache-Control: public, max-age=31536000, immutable`.
  - Admin/private SPA HTML shell: no long-lived CDN cache; use `Cache-Control: no-cache, no-store, must-revalidate` unless Vercel requires a different safe revalidation policy.
  - Public branded HTML shell, if implemented: cache only public data and use a bounded CDN policy with explicit staleness/invalidation behavior.
  - Private/authenticated API responses: `Cache-Control: private, no-store`.
- Add `trailingSlash: false` if compatible with current routing.
- Verify cache behavior in Vercel preview and production using response headers and Vercel cache status headers.

#### Acceptance Criteria

- Hashed assets are long-cacheable.
- HTML shell is not stale across deployments.
- Existing redirects and rewrites continue to work.

### 11.3 Fix OG Image and Font Loading

#### Tasks

- Fix `og:image` to reference an asset that exists.
  - Preferred: generate and commit `public/og-image.png` from the existing SVG.
  - Alternative: change tags to SVG only if target social platforms support it, but PNG is preferred.
- Self-host Inter via `@fontsource/inter` or improve font fallback/preload.
- Update body font stack to reduce layout shift:
  - `'Inter', 'Helvetica Neue', Arial, sans-serif`.

#### Acceptance Criteria

- Social preview image returns HTTP 200.
- No render-blocking Google Fonts dependency if self-hosted.
- Visual appearance remains close to current Inter typography.

---

## 12. Phase 5: Frontend Reliability and UX Fixes

**Goal:** Make the app feel trustworthy by surfacing failures and preventing destructive mistakes.

### 12.1 Fix Form Save/Delete Error Handling

#### Tasks

- Wrap `saveForm` network call in try/catch/finally.
- Ensure loading state always resets.
- Check `res.ok`; show response error message when available.
- Update `deleteForm` to check `res.ok` before removing from local state.
- Show a visible error if delete fails.

#### Acceptance Criteria

- Offline/network error during save does not leave button stuck.
- Failed delete does not remove form from local UI.
- User sees actionable error messages.

### 12.2 Surface Credentials and Subscription Fetch Errors

#### Tasks

- Add separate error states for credentials and subscription.
- Show warning banners in relevant panels when fetch fails.
- Provide retry buttons.

#### Acceptance Criteria

- Failed credential fetch is visible to user.
- Failed subscription fetch is visible to user.
- Defaults are not silently presented as real loaded data.

### 12.3 Add Confirmation for Subscription Changes

#### Tasks

- Do not persist subscription plan/status changes immediately on dropdown change.
- Use explicit Save button or confirmation dialog.
- For downgrades or disabling active status, require confirmation.
- Show loading and success/error feedback.

#### Acceptance Criteria

- Accidental dropdown change does not immediately mutate billing state.
- User receives confirmation and feedback.

### 12.4 Improve Empty and Loading States

#### Tasks

- Dashboard empty state should include a clear CTA and mobile-neutral language.
- Analytics unloaded state should explain what is happening and provide a clear load/retry button.
- QR generation state should include accessible progress and error/retry state.
- Global loading spinner should use `role="status"` and `aria-live="polite"`.

#### Acceptance Criteria

- Every async panel has loading, empty, error, and success states.
- Empty state language works on mobile and desktop.

---

## 13. Phase 6: Admin UI Redesign to Standard SaaS Layout

**Goal:** Replace the current unusual admin UI structure with a familiar, professional SaaS dashboard layout while preserving existing functionality.

This phase is intentionally separate from accessibility polish. The current app does not just need labels and spacing fixes; it needs a clearer information architecture and layout model.

### 13.1 Target Desktop Layout

Use a conventional SaaS app shell on authenticated admin routes:

- Fixed or sticky left sidebar, approximately 240-280px wide.
- Main content area with page header, optional actions row, and content panels.
- Top area inside the sidebar includes SignFlow branding.
- Bottom area inside the sidebar includes theme toggle, account/logout, and possibly subscription status.
- Current navigation item is visibly active.
- Main content uses cards/panels with consistent spacing and max widths.

Primary sidebar navigation should include:

- Forms
- Create Form
- Zoho Connection
- Subscription / Billing
- Settings

Optional secondary navigation within a selected form:

- Overview
- Landing Page
- QR Code
- Analytics
- Settings

### 13.1A Admin Navigation and Routing Behavior

- Preserve the current routing model unless the implementing PR explicitly changes it.
- If the app currently uses hash/internal view state, sidebar navigation may use the same model for the first admin shell PR.
- Each primary admin section must have a stable internal key: `forms`, `create-form`, `zoho-connection`, `subscription-billing`, and `settings`.
- Form details must have a stable selected form state and a stable secondary section key: `overview`, `landing-page`, `qr-code`, `analytics`, and `settings`.
- Browser refresh should not produce a broken or blank admin state. If deep-link persistence is not implemented in the first PR, document that limitation in the PR notes.

### 13.2 Target Mobile Layout

Use an intentional mobile adaptation, not simply wrapped desktop buttons:

- Sidebar collapses behind a hamburger menu or slide-over drawer.
- Safe default breakpoint: persistent desktop sidebar at `lg`/1024px and above; mobile drawer below that.
- Header shows product name, current section, and menu button.
- Drawer contains the same primary navigation as desktop.
- Drawer closes when a nav item is selected, when the user presses Escape, or when the user activates the overlay/close button.
- Drawer traps focus while open and returns focus to the menu button when closed.
- Body scroll is locked while the drawer is open.
- Menu button has an accessible name and reflects open state with `aria-expanded`.
- Drawer has an accessible label.
- Background content is not reachable by keyboard while the drawer is open.
- Main content is single-column with appropriate vertical rhythm.
- Main content uses 16px minimum horizontal padding.
- Primary actions remain reachable without tiny tap targets.
- Form card actions meet approximately 44x44px tap target size where feasible.
- 320px viewport has no horizontal overflow.

### 13.3 Information Architecture Changes

Current dashboard mixes creation, list, settings, credentials, subscription, QR, and analytics in ways that feel ad hoc. Restructure into predictable areas:

#### Forms Section

- Shows form list as the primary content.
- Includes search/filter if simple to add, otherwise defer.
- Has a clear primary action: `Create Form`.
- Empty state includes a prominent `Create your first form` button.

#### Create/Edit Form Section

- Dedicated page or panel for form creation/editing.
- Uses labeled fields and grouped sections:
  - Basic details: display name, slug.
  - Zoho template: template ID, role name, API domain.
  - Landing page customization can be a secondary section or moved to form details.

#### Form Details Section

- Page header: form name, public URL, status, primary actions.
- Secondary tabs/subnav:
  - Overview
  - Landing Page
  - QR Code
  - Analytics
  - Settings
- QR and analytics load on demand.

#### Zoho Connection Section

- Credentials and connection test belong here, not buried in a generic settings panel.
- Show connection status clearly.
- Show credential load/save errors clearly.

#### Subscription / Billing Section

- Plan, status, seats, portal/checkout actions belong here.
- Changes require explicit save/confirmation.

#### Settings Section

- Only app-level preferences should live here:
  - Theme preference.
  - Account/logout.
  - Possibly domain/public URL info if relevant.

### 13.4 Visual Design Requirements

The target should be industry-standard and restrained, not flashy. Use these concrete defaults unless the existing codebase already has equivalent tokens:

- Page background: neutral light background in light mode and neutral dark background in dark mode.
- Cards/panels: consistent border, radius, padding, and shadow treatment across admin sections.
- Spacing: use a consistent 4px-based spacing scale; common card padding should be 16px on mobile and 24px on desktop.
- Sidebar width: 240-280px on desktop.
- Content width: full-width responsive content with readable max widths for forms/settings panels where appropriate.
- Primary action: one consistent blue or existing brand-primary style.
- Secondary action: neutral outline or ghost style.
- Destructive action: consistent danger color and confirmation pattern.
- Headings: one page-level heading per view, with consistent section heading sizes.
- Body text: consistent text color, muted text color, and line height.
- Badges: consistent size, radius, and semantic colors for success, warning, danger, and neutral.
- Inputs/selects/textareas: consistent height, border, focus ring, label treatment, helper text, and error text.
- Avoid arbitrary text sizes like `text-[10px]` and `text-[11px]` unless there is a documented design reason.
- Keep dark mode if already supported, but ensure both themes use the same layout, spacing, hierarchy, and interaction states.

### 13.5 Component Targets

Implement or extract these components as needed:

- `AdminShell`
- `SidebarNav`
- `MobileNavDrawer`
- `PageHeader`
- `SectionCard`
- `FormsList`
- `FormEditor`
- `FormDetailsLayout`
- `ZohoConnectionPage`
- `SubscriptionPage`

Do not over-abstract. Components should be introduced where they make the layout clearer or reduce `App.tsx` complexity.

Admin shell migration must be incremental:

- First introduce `AdminShell`, sidebar, mobile drawer, and page header around existing admin content.
- Then move one section at a time into dedicated views/pages.
- Do not combine public signing changes, API response-shape changes, and admin IA redesign in the same PR.
- Do not rewrite unrelated business logic while extracting layout components.

### 13.6 Acceptance Criteria

- Authenticated admin routes use a persistent sidebar on desktop at the chosen breakpoint.
- Mobile admin routes use an accessible drawer or equivalent responsive navigation below the chosen breakpoint.
- The old authenticated top-row primary navigation is removed or reduced to contextual page actions only.
- Users can clearly find Forms, Create Form, Zoho Connection, Subscription/Billing, and Settings from primary navigation.
- Active navigation state is visible and exposed with `aria-current="page"` or equivalent.
- Main content is wrapped in a clear landmark such as `<main>`.
- Form details have a page header, public URL/status area, and secondary navigation for Overview, Landing Page, QR Code, Analytics, and Settings.
- QR and Analytics sections load their heavy data on demand.
- Existing create, edit, delete, QR, analytics, credentials, subscription, theme, and logout functionality remains available.
- Primary, secondary, and destructive actions use consistent styles across all admin sections.
- Empty states include one clear next action.
- 320px viewport has no horizontal overflow.
- Keyboard users can open, navigate, and close the mobile drawer.

### 13.7 Notes for Codex

- Preserve public signing page and public marketing page behavior while changing admin layout.
- Prefer extracting admin UI from `App.tsx` rather than adding more conditional JSX to the existing file.
- Keep route/hash behavior compatible unless a route migration is explicitly included in the PR.
- Do not attempt a custom visual art direction. The desired outcome is familiar, clean, standard SaaS UI.

---

## 14. Phase 7: Accessibility and Mobile Remediation

**Goal:** Resolve known accessibility failures and obvious mobile polish issues.

### 14.1 Fix Labels and Heading Structure

#### Tasks

- Change header logo text from `<h1>` to non-heading text when hero/page heading exists.
- Add real labels to login inputs.
- Add real labels to dashboard create/edit form inputs.
- Add `htmlFor`/`id` associations in landing page editor.
- Add labels for subscription plan/status/seats controls.

#### Acceptance Criteria

- One logical `<h1>` per rendered view.
- All form controls have accessible names.
- No placeholder-only labels remain for critical forms.

### 14.2 Implement Tab ARIA Pattern

#### Tasks

- Wrap settings tabs in `role="tablist"`.
- Use `role="tab"`, `aria-selected`, `aria-controls`, and stable IDs.
- Wrap tab panels in `role="tabpanel"` and `aria-labelledby`.
- Implement expected keyboard behavior: Tab moves focus into/out of the tablist, arrow keys move between tabs, Home/End move to first/last tab, and Enter/Space activates the focused tab if activation is not automatic.
- Preserve visible focus states.

#### Acceptance Criteria

- Screen readers announce selected tab state.
- Keyboard users can navigate and activate tabs.

### 14.2A Additional Accessibility Requirements

- Destructive confirmation dialogs and QR modals must trap focus, restore focus on close, close on Escape, and expose an accessible name.
- Async regions that update after user action should use appropriate `aria-busy`, `role="status"`, or user-visible error text without excessive live-region announcements.
- Error messages for form fields should be programmatically associated where practical with `aria-describedby`.
- Public signing and core admin flows should target WCAG 2.2 AA for text contrast, focus visibility, labels, and keyboard operation unless explicitly waived.

### 14.3 Fix Reduced Motion and Mobile Issues

#### Tasks

- Fix loading spinner CSS so users with `prefers-reduced-motion: reduce` do not get animation.
- Change 404 heading to responsive clamp, for example `text-[clamp(4rem,25vw,10rem)]`.
- Increase mobile tap target size for form card quick actions.
- Reduce excessive mobile section spacing on marketing page.
- Make QR image use `max-w-full` with a reasonable cap.

#### Acceptance Criteria

- No horizontal overflow on 320px viewport.
- Primary mobile tap targets are at least approximately 44x44px where feasible.
- Reduced-motion preference is respected.

---

## 15. Phase 8: State and Render Maintainability

**Goal:** Reduce re-render risk and make future work safer without a rewrite.

### 15.1 Convert Fetch Attempt Flags to Refs

Current problem: fetch dedupe flags are state but do not affect UI.

#### Tasks

- Convert `credentialsFetchAttempted`, `subscriptionFetchAttempted`, and `formsFetchAttempted` to `useRef` where possible.
- Preserve retry behavior fixed for transient form fetch errors.

#### Acceptance Criteria

- No extra re-renders from setting fetch-attempt flags.
- Auth/logout resets refs correctly.

### 15.2 Consolidate Landing Config Draft State

Current problem: 13 separate state variables duplicate `landingConfig`.

#### Tasks

- Replace individual landing page state variables with one draft object.
- Use helpers to map form definition to draft and draft to API payload.
- Preserve validation behavior.

#### Acceptance Criteria

- Landing page editor behavior unchanged.
- Save payload remains compatible with API/types.
- Less duplicated reset/edit/open logic.

### 15.3 Extract Heavy Views Gradually

#### Tasks

- Extract at least:
  - `PublicFormPage`.
  - `FormDetailsView`.
  - `DashboardView` or dashboard card list.
- Memoize derived values where meaningful:
  - selected form lookup.
  - public form theme color calculations.
- Do not add `useMemo`/`useCallback` indiscriminately. Add only where props or heavy derived work justify it.

#### Acceptance Criteria

- App remains functionally identical.
- Component boundaries align with routes/views.
- Public signing page extraction supports bundle splitting.

---

## 16. Detailed File-Level Work Queue

### `App.tsx`

- Parallelize login fetches.
- Remove analytics fetch loop from `fetchForms`.
- Remove QR generation from `fetchForms` critical path.
- Fix save/delete error handling.
- Add visible credentials/subscription errors.
- Add subscription confirmation/save behavior.
- Fix accessible labels.
- Replace authenticated top-button navigation with standard sidebar app shell.
- Add mobile drawer navigation for authenticated app.
- Extract public form page and large views.
- Fix mobile and loading states.

### `components/AdminShell.tsx` / `components/SidebarNav.tsx` / `components/MobileNavDrawer.tsx`

- Create these components if they do not exist.
- Implement desktop sidebar navigation.
- Implement responsive mobile navigation.
- Centralize authenticated app layout, branding, account controls, and theme/logout actions.

### `components/FormDetailsLayout.tsx` / `components/FormEditor.tsx`

- Extract form details hierarchy and form editing UI from `App.tsx` where practical.
- Preserve existing form behavior while making layout conventional and maintainable.

### `api/forms.ts`

- Minimize public form lookup selection.
- Minimize authenticated list payload.
- Add no-store headers for private responses.
- Guard JSON parse.
- Ensure DELETE reports not-found when possible.

### `api/analytics.ts`

- Replace unbounded aggregation.
- Add optional batch summary endpoint if dashboard summaries are needed.
- Add rate limit to GET if appropriate.
- Add private no-store headers.
- Guard JSON parse.

### `api/zoho.ts`

- Cache Zoho access token.
- Add OAuth/API timeouts and limited retry.
- Avoid raw third-party response leakage.
- Log embed token fallback failures.
- Parallelize safe independent work.

### `api/qrcodes.ts`

- Avoid `SELECT *` with QR image blob when not needed.
- Parallelize ownership and existing QR lookups.
- Add private no-store headers.

### `api/qr-redirect.ts`

- Add try/catch.
- Add redirect cache policy.
- Ensure `forms.qr_stable_id` index exists.

### `api/rateLimiter.ts`

- Fix JWT-derived key.
- Document or replace in-memory limitation.

### `vite.config.ts`

- Add build target, sourcemap false, CSS code splitting, manual chunks.

### `vercel.json`

- Add immutable static asset caching.
- Add safe HTML shell caching.
- Consider `trailingSlash: false`.

### `index.html`

- Fix `og:image`.
- Fix reduced motion CSS.
- Improve font loading/fallback or move font import to self-hosted CSS.

### `components/QRCodeModal.tsx`

- Verify inert/focus trap reliability.
- Lazy-load QR modal from admin code path.

### `supabase/migrations/*`

- Add missing hot path indexes.
- Add token cache columns if implementing DB-backed Zoho access-token caching.
- Add analytics aggregation RPC if using RPC approach.

---

## 17. Suggested PR Breakdown

### PR 1: Public Signing Page Speed Foundation

- Extract `PublicFormPage`.
- Add public page skeleton/loading/error state.
- Minimize public form lookup payload.
- Add hot path indexes for slug/template/QR stable ID.

### PR 2: Dashboard Startup Performance

- Parallelize login fetches.
- Remove analytics N+1 from `fetchForms`.
- Remove QR generation from login critical path.
- Exclude QR PNG blobs from forms list.

### PR 3: Vite/Vercel Caching and Bundle Split

- Add manual chunks.
- Add asset cache headers.
- Fix HTML shell cache policy.
- Fix OG image.
- Self-host or improve Inter loading.

### PR 4: API Performance and Safety

- Cache Zoho OAuth access tokens.
- Add timeouts/retry where appropriate.
- Fix analytics aggregation.
- Parallelize independent API queries.
- Add no-store headers.

### PR 5: Frontend Reliability UX

- Fix save/delete error handling.
- Add credentials/subscription error surfaces and retries.
- Add subscription confirmation/save flow.
- Improve empty states and QR/analytics loading states.

### PR 6A: Admin Shell Foundation

- Introduce authenticated `AdminShell`.
- Add persistent desktop sidebar.
- Add accessible mobile nav drawer.
- Preserve existing admin content and behavior inside the new shell.
- Remove or demote old top-row primary navigation.

### PR 6B: Admin Section Reorganization

- Reorganize primary sections: Forms, Create Form, Zoho Connection, Subscription/Billing, Settings.
- Keep route/hash behavior compatible.
- Ensure all existing functionality remains reachable.

### PR 6C: Admin Visual Consistency

- Clean up primary/destructive button styles and dashboard empty states.
- Normalize cards, headings, badges, spacing, inputs, and empty states.
- Verify desktop, mobile, light mode, and dark mode.

### PR 7: Accessibility and Mobile Polish

- Fix labels, headings, tabs, reduced motion.
- Fix mobile overflow/tap targets/spacing.
- Verify keyboard behavior.

### PR 8: State Cleanup and Maintainability

- Convert fetch flags to refs.
- Consolidate landing config state.
- Extract remaining heavy views.

---

## 18. Testing Requirements

Run after each PR:

```bash
npm test
npm run build
```

Manual QA required after relevant PRs:

1. Public form by slug loads on desktop and mobile.
2. Public form submit opens/returns embedded Zoho signing URL.
3. QR redirect route resolves to expected form.
4. Admin signup/login works.
5. Dashboard loads forms quickly.
6. Create/edit/delete form works and handles simulated network failure.
7. Credentials settings load, save, and show error on failure.
8. Subscription panel cannot accidentally downgrade without confirmation.
9. QR tab generates and displays QR code on demand.
10. Analytics tab loads data and handles empty/error states.
11. Keyboard can navigate login, dashboard cards, settings tabs, modal, and public form.
12. 320px viewport has no horizontal scroll.
13. Desktop authenticated app shows persistent sidebar navigation.
14. Mobile authenticated app shows a drawer or equivalent responsive navigation.
15. Users can reach Forms, Create Form, Zoho Connection, Subscription/Billing, and Settings without guessing.
16. Verify public `/api/forms?slug=<slug>` response contains no Zoho template ID, role name, API domain, credential IDs, owner IDs, tokens, or QR image blobs.
17. Verify public form update invalidates or refreshes cached public shell/metadata within the documented TTL.
18. Verify hot-path queries use intended indexes with query-plan evidence.
19. Verify rate limits work across multiple serverless invocations if durable storage is implemented.
20. Verify Zoho access token refresh is reused across concurrent submissions for the same credential.

Public signing page QA, specifically for `www.signflow.ink/fbmc`:

1. Load with cache disabled and Fast 3G throttling.
2. Confirm the user never sees a complete generic SignFlow/default-themed form card before Farrell Brothers branding appears.
3. Confirm the loading state is either neutral skeleton or correctly branded.
4. Confirm final first real form render includes the Farrell Brothers logo, dark blue card color, white page background, correct headline, and custom button color.
5. Confirm no layout shift larger than a small skeleton-to-content transition occurs when config loads.
6. Confirm `/api/forms?slug=fbmc` returns a 200 and response payload excludes unnecessary QR image blobs.
7. Confirm DevTools Network shows CSS linked in initial HTML and loaded before the first real form render.

Performance checks after Phase 1-4:

1. Run production build and record chunk sizes.
2. Use Chrome DevTools Fast 3G throttling on public signing route.
3. Confirm public signing route does not request admin-only QR chunk initially.
4. Confirm `/assets/*` response headers include long-lived immutable cache.
5. Confirm HTML shell is not served with long-lived cache.
6. Confirm `/api/forms?slug=<slug>` response payload excludes unnecessary blobs.
7. Run Lighthouse mobile against public signing route in Vercel preview and record Performance, Accessibility, Best Practices, and SEO scores.
8. Record Web Vitals or equivalent production/preview measurements: LCP, INP, CLS, TTFB, and FCP.
9. Confirm Vercel cache status headers match the intended policy for assets, HTML, public metadata, and private APIs.
10. Confirm public route loaded JS remains within the agreed gzip/brotli budget.
11. Confirm API logs include request ID, route, status, duration, and safe dependency timing for changed endpoints.

## 18A. Required Automated Test Coverage

Minimum automated coverage should be added where the existing test harness supports it. If automation is not practical in a PR, the PR must document the manual substitute and why automation was deferred.

Required coverage:

1. Public form lookup returns only allowed public fields.
2. Public form loading renders skeleton before customer config and does not render a generic final form.
3. Public submit handles Zoho success, Zoho failure, malformed input, duplicate submit, and timeout.
4. Authenticated forms list excludes QR image blobs by default.
5. Cross-user form, QR, analytics, credential, and subscription access is denied.
6. Malformed JSON returns 400.
7. Private endpoints include `Cache-Control: private, no-store`.
8. Public metadata cache does not include private fields.
9. Rate limiter keys are user-specific for authenticated users.
10. Save/delete failures do not mutate local UI incorrectly.
11. Subscription changes require explicit confirmation or save.
12. Accessible names exist for critical login, public signing, form editor, billing, and credential controls.

## 18B. Manual QA Release Gates

A PR cannot be merged until applicable gates are marked pass, fail, or not applicable.

Public signing gates:

1. Valid slug loads on desktop and mobile.
2. Invalid slug shows a safe not-found or support state.
3. Disabled/deleted/unavailable form does not expose private data.
4. Slow network shows neutral skeleton or correctly branded shell only.
5. Submit button prevents accidental duplicate submissions.
6. Zoho outage or timeout shows user-visible error and safe retry guidance.
7. Embedded signing URL is returned/opened only after valid submit.
8. Analytics tracking failure does not block signing.
9. QR scan from a real mobile camera resolves correctly.
10. Existing printed QR URLs remain compatible.

Admin gates:

1. Login, logout, expired session, and refresh work correctly.
2. Forms list, create, edit, delete, and cancel-delete work.
3. Cross-user object access attempts fail.
4. Credentials load, save, validation failure, and retry work.
5. Subscription/billing load, checkout/portal failure, downgrade confirmation, and cancellation work.
6. QR generate, regenerate if allowed, display, download/copy, and error states work.
7. Analytics empty, loading, success, and error states work.
8. Desktop sidebar and mobile drawer expose all primary sections.
9. 320px viewport has no horizontal overflow.
10. Keyboard-only users can complete login, public signing, form creation, credential save, QR modal use, and logout.

Accessibility gates:

1. Axe or equivalent scan has no critical or serious issues on public signing, login, forms list, form editor, billing, credentials, and QR modal.
2. One logical `<h1>` exists per rendered view.
3. Focus is visible and not trapped incorrectly.
4. Modal focus is trapped while open and restored on close.
5. Reduced-motion preference is respected.
6. Color contrast meets WCAG 2.2 AA for text and interactive controls unless explicitly waived.

## 18C. Deployment Safety and Rollback

### Requirements

- Every PR deploys to a Vercel preview and passes smoke checks before production promotion.
- Performance-sensitive PRs include before/after measurements for public signing page, dashboard load, and affected APIs.
- Risky changes such as server-rendered public shell, token caching, rate limiter replacement, and response-shape changes must be independently revertible.
- Database migrations must be backward-compatible for at least one deploy. Do not require frontend and backend to switch atomically unless explicitly planned.
- Token-cache migrations must include rollback notes that do not expose or orphan secrets.
- Public signing page smoke test must run after production deployment for at least one known slug.

### Rollback Triggers

- Public signing page load/API error rate increases above agreed threshold.
- Public form submit/Zoho embedded signing failures increase.
- `/api/forms?slug=<slug>` p95 latency regresses materially.
- Public page LCP or JS payload regresses beyond the PR budget.
- Cache headers cause stale HTML shell or broken asset loading after deploy.

### Rollback Procedure

- Prefer Vercel instant rollback to the previous production deployment for frontend/API regressions.
- If a DB migration is involved, ensure the previous deployment remains compatible before rollback.
- If token caching or rate limiting causes production issues, disable the new path via config/feature flag or deploy a targeted revert.

---

## 19. Risks and Mitigations

### Risk: Token Caching Stores Sensitive Data Incorrectly

Mitigation: Reuse existing encryption helpers/patterns for `user_credentials`. Never expose access token to frontend. Add migration carefully.

### Risk: Code Splitting Breaks Hash-Based Routing

Mitigation: Keep route resolution logic unchanged first. Extract render components before changing routing architecture.

### Risk: Removing Auto QR Generation Surprises Existing Admins

Mitigation: Show clear missing-QR state with one-click Generate QR Code. Optionally start background generation after dashboard paints.

### Risk: Reducing Forms Payload Breaks Existing UI Assumptions

Mitigation: Audit all frontend reads of QR fields before changing response shape. Add fallback fetch on QR tab open.

### Risk: Cache Headers Cause Stale App Shell

Mitigation: Long-cache only hashed `/assets/*`. Do not long-cache HTML shell.

### Risk: Public Metadata Leaks Private Zoho Configuration

Mitigation: Use an explicit public response allowlist. Resolve Zoho template, role, API domain, and credentials only inside server-side submit handlers.

### Risk: Migrations Lock Production Tables

Mitigation: Review table sizes, duplicate data, transaction behavior, and index creation strategy before running migrations. Prefer additive, backward-compatible migrations and verify query plans after deployment.

### Risk: Analytics or Logs Capture PII

Mitigation: Define allowed analytics fields, redact submitted contact data, never log tokens/embed URLs/raw third-party payloads, and document retention expectations.

### Risk: Authorization Regression Exposes Another User's Data

Mitigation: Add cross-user regression tests or manual QA for forms, QR codes, analytics, credentials, and subscriptions before merging API changes.

### Risk: Rate Limiting Blocks Legitimate Signers

Mitigation: Start with conservative limits, log 429 events, document support override steps, and monitor public submit failures after release.

### Risk: Public Signing Outage After Bundle/Routing Changes

Mitigation: Release public route changes behind a preview validation gate. Verify known customer slugs and existing QR URLs before production promotion.

### Risk: Token Cache Migration Fails or Stores Tokens Unsafely

Mitigation: Use encrypted columns or approved secure storage only. Verify rollback, redaction, and least-privilege access before release.

### Risk: Billing/Admin UI Changes Cause Accidental Subscription Mutation

Mitigation: Require explicit save/confirmation, test cancel paths, and verify failed mutations do not update local UI as if successful.

### Risk: Admin UI Redesign Becomes a Broad Rewrite

Mitigation: Keep existing behavior and route model first. Introduce the app shell and navigation structure before deeper component extraction. Do not redesign public signing pages and admin layout in the same PR unless the change is very small.

---

## 20. Codex Implementation Checklist

For each PR, Codex should:

1. Start from latest `main` unless instructed otherwise.
2. Make the smallest coherent change set for the selected phase.
3. Preserve unrelated user changes.
4. Run `npm test` and `npm run build`.
5. Include build output chunk sizes in PR description for performance PRs.
6. Include manual QA notes for public signing page changes.
7. Include screenshots or screen recordings for UI changes.
8. Include security/privacy notes for API/auth/token/cache changes.
9. Include release gate status and rollback notes.
10. Avoid broad rewrites unless the selected phase explicitly calls for extraction.
11. If a task requires production credentials or admin dashboard access, leave a clear manual verification note.

## 20A. Release Gates

Before production release:

1. `npm test` passes.
2. `npm run build` passes.
3. Applicable automated tests from section 18A pass or have documented manual substitutes.
4. Manual QA gates from section 18B are completed.
5. Performance evidence is attached for public signing and dashboard startup changes.
6. Security/privacy review confirms no token, credential, signer PII, subscription, or cross-user data leakage.
7. Accessibility review confirms no critical or serious issues in core public/admin flows.
8. Database migrations are reviewed for rollback and production impact.
9. Cache headers are verified in a Vercel preview.
10. Public signing smoke test passes on at least one known production-like customer slug.
11. Rollback plan is documented for the PR or release.

---

## 21. Final Decisions and Defaults

These defaults unblock implementation unless a product owner overrides them before the relevant PR starts:

1. Cache Zoho access tokens in encrypted DB columns using existing encryption patterns.
2. Make analytics on-demand first. Do not show dashboard analytics summaries unless a batch endpoint is added.
3. Generate QR codes lazily first. Do not block dashboard load with QR generation.
4. Fix the authenticated rate-limit key immediately. Defer distributed rate limiting unless approved shared storage is available, except public submit and QR redirect where durable storage is required unless explicitly waived.
5. Self-host Inter if dependency policy allows; otherwise improve fallback/preload.
6. Admin sidebar should use text labels. Icons may be added only if an existing icon dependency is already present or the PR explicitly adds one.
7. Preserve the current routing model for the first admin shell PR. Do not migrate routing unless explicitly included in that PR.
8. Use the numeric rate limits below unless production traffic proves they are too strict or too loose:
  - Public form lookup (`GET /api/forms?slug=`): 60 requests/minute per IP + slug.
  - Public Zoho submit (`POST /api/zoho` or successor submit endpoint): 5 requests/minute per IP + form, 20 requests/hour per IP + form.
  - QR redirect (`GET /qr/:id`): 120 requests/minute per IP + QR stable ID.
  - Authenticated analytics reads: 60 requests/minute per verified user.
  - Authenticated form mutations: 20 requests/minute per verified user.
  - Credential/subscription mutations: 10 requests/minute per verified user.
  - Health check endpoint: no user-facing rate limit unless abuse is observed.
9. Supported browser/device matrix for release signoff:
  - Chrome desktop current stable on macOS or Windows.
  - Safari desktop current stable on macOS.
  - Firefox desktop current stable.
  - Safari iOS current and previous major iOS version.
  - Chrome Android current stable.
  - Responsive viewport checks at 320px, 390px, 768px, 1024px, and 1440px widths.
10. Accessibility scope: target WCAG 2.2 AA for all public signing and authenticated admin flows. Marketing-only content should meet AA where practical and must not introduce critical/serious accessibility issues.
11. Monitoring/logging default: use Vercel runtime logs plus Vercel Analytics/Web Analytics if available for the first implementation pass. If Vercel Analytics is not available, implement a lightweight internal metrics endpoint/table for Web Vitals and safe API timings. A later PR may replace this with Sentry, Logtail, Datadog, or another approved platform.
12. Production release approver default: product owner or repository owner must approve production promotion after public signing, security/privacy, accessibility, billing, and rollback gates pass. If unavailable, the acting technical lead may approve only low-risk docs/UI-only PRs; public signing/API/auth/billing changes require explicit owner approval.
