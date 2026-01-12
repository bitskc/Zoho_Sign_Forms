# SignFlow Pro Documentation

**Last Updated:** 2026-01-12

## Quick Links

- [Features Overview](#features-overview) - What SignFlow Pro can do
- [Deployment Guide](DEPLOYMENT_GUIDE.md) - How to deploy to production
- [Development Priorities](PUNCHLIST.md) - QA-recommended action items
- [Archive](archive/) - Historical implementation reports

---

## Features Overview

### Core Functionality
- **Form Management** - Create and manage signature request forms linked to Zoho Sign templates
- **Public Form Pages** - Shareable URLs with custom branding
- **Zoho Sign Integration** - Embedded signing experience with OAuth 2.0
- **Multi-Region Support** - Works with Zoho US, EU, India, Australia, Japan

### QR Code System
- **Persistent QR Codes** - Generate QR codes that survive URL changes
- **Stable IDs** - Redirect mechanism via `/qr/{id}` endpoints
- **Download & Share** - PNG export for print materials
- **Database-Backed** - QR codes stored in `form_qrcodes` table

### Analytics & Tracking
- **Event Tracking** - Visit, submit_start, submit_success, submit_error events
- **Time Windows** - Filter by day, week, month, or all-time
- **Conversion Metrics** - Automatic calculation of conversion rates
- **GDPR Compliant** - No IP address storage
- **Timezone Aware** - UTC-normalized date boundaries

### Landing Page Customization
- **Visual Branding** - Custom logos, colors, button text
- **Content Control** - Headlines, descriptions, footer text
- **Contact Information** - Company name, email, phone display
- **Theme System** - Primary and background color customization
- **WCAG Validation** - Color contrast checking (Phase 3 planned)

### Security & Performance
- **Rate Limiting** - In-memory sliding window algorithm
- **Row-Level Security** - Supabase RLS policies on all tables
- **URL Validation** - HTTPS-only, no private IPs (SSRF protection)
- **No XSS Vulnerabilities** - Custom CSS removed in Phase 1
- **Edge Runtime** - Sub-100ms latency via Vercel Edge Functions

---

## Documentation Organization

### Active Documentation
- **[PUNCHLIST.md](PUNCHLIST.md)** - QA-recommended priorities and 30-day action plan
- **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** - Production deployment instructions
- **[FEATURES.md](FEATURES.md)** - Detailed feature descriptions and usage
- **[RATE_LIMITING_SIMPLIFIED.md](RATE_LIMITING_SIMPLIFIED.md)** - Rate limiting architecture decisions

### Reference Documentation
- **[LANDING_PAGE_SYSTEM_OVERVIEW.md](LANDING_PAGE_SYSTEM_OVERVIEW.md)** - Technical deep-dive on landing customization
- **[ANALYTICS_ROADMAP.md](ANALYTICS_ROADMAP.md)** - Future analytics enhancements
- **[QA_ASSESSMENT_REPORT.md](QA_ASSESSMENT_REPORT.md)** - Original security/quality audit (historical)
- **[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)** - Original phase-based implementation plan (historical)

### Archived Documentation
- **[archive/](archive/)** - Historical completion reports from Phase 1-2 implementations

---

## Current Status

### Phase 1: Security Fixes ✅ COMPLETE
- Removed custom CSS injection vulnerability
- Added RLS policies to forms table
- Implemented URL validation (HTTPS-only, SSRF protection)

### Phase 2: Quality Improvements ✅ COMPLETE
- Analytics timezone handling and time windows
- Landing customization integration tests (22 tests)
- Rate limiting implementation (in-memory, 32 tests)

### Phase 3: Production Readiness 🔄 IN PROGRESS
**See [PUNCHLIST.md](PUNCHLIST.md) for prioritized action items**

Top priorities (Week 1-2):
1. Add Sentry error tracking
2. Add health check endpoint
3. Add first E2E test
4. Security audit (CSRF, CSP, request limits)

---

## Test Coverage

**Current:** 112 tests passing
- Analytics: 23 tests (timezone, time windows, conversion rates)
- Landing Customization: 22 tests (JSONB round-trip, unicode, performance)
- Rate Limiting: 32 tests (sliding window, multi-user, edge cases)
- Zoho Integration: 2 tests (service mocks)
- Routing: 8 tests (subdomain detection, slug parsing)
- URL Validation: 22 tests (HTTPS, private IP blocking, SSRF)
- API Endpoints: 3 tests (forms, zoho validation)

**Coverage Goals:**
- Integration/E2E tests for critical user flows
- Security tests for XSS, CSRF, authentication bypass
- Performance tests for load, stress, and soak scenarios

---

## Technology Stack

### Frontend
- React 19.2.3 + TypeScript 5.8
- Vite 6.2 (build tool)
- CSS-in-JS (inline styles)

### Backend
- Vercel Edge Functions (Cloudflare Workers runtime)
- Supabase (PostgreSQL + Auth)
- Google Gemini API (AI validation)
- Zoho Sign API (e-signature service)

### Database
- PostgreSQL (via Supabase)
- Tables: forms, form_qrcodes, form_analytics, user_credentials
- RLS enabled on all tables
- JSONB for flexible configuration storage

### Deployment
- Vercel (hosting + edge functions)
- GitHub Actions (CI/CD: tests + build verification)
- Supabase managed database

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        User Browser                          │
│  React SPA (App.tsx) - Public Forms + Admin Dashboard       │
└────────────┬─────────────────────────────────────┬──────────┘
             │                                     │
             │ API Calls                           │ Auth
             ↓                                     ↓
┌────────────────────────┐             ┌─────────────────────┐
│   Vercel Edge          │             │  Supabase Auth      │
│   Functions (API)      │────────────→│  JWT Validation     │
│                        │             └─────────────────────┘
│  /api/forms.ts         │
│  /api/zoho.ts          │                      ↓
│  /api/analytics.ts     │             ┌─────────────────────┐
│  /api/qrcodes.ts       │←───────────→│  PostgreSQL DB      │
│  /api/credentials.ts   │             │  (Supabase)         │
└────────────┬───────────┘             │  - forms            │
             │                         │  - form_qrcodes     │
             │                         │  - form_analytics   │
             ↓                         │  - user_credentials │
┌────────────────────────┐             └─────────────────────┘
│   External APIs        │
│                        │
│  - Zoho Sign API       │
│  - Google Gemini API   │
│  - QR Code API         │
└────────────────────────┘
```

---

## Getting Started

### For Developers
1. Read [FEATURES.md](FEATURES.md) to understand capabilities
2. Follow setup in main [README.md](../README.md)
3. Review [PUNCHLIST.md](PUNCHLIST.md) for current priorities

### For DevOps
1. Review [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for deployment steps
2. Set up Vercel environment variables
3. Apply database migrations
4. Configure Zoho Sign OAuth credentials

### For QA Engineers
1. Review [QA_ASSESSMENT_REPORT.md](QA_ASSESSMENT_REPORT.md) for original audit
2. Follow [PUNCHLIST.md](PUNCHLIST.md) for testing priorities
3. Run test suite: `npm test`

---

## Contributing

### Code Changes
1. Create feature branch from `development`
2. Write tests for new functionality
3. Ensure all tests pass: `npm test`
4. Build succeeds: `npm run build`
5. Create PR to `development` branch

### Documentation Changes
- Update relevant docs in `/docs` folder
- Keep README.md in sync with changes
- Archive historical documents to `/docs/archive`

---

## Support & Resources

### External Documentation
- [Zoho Sign API Docs](https://www.zoho.com/sign/api/)
- [Supabase Documentation](https://supabase.com/docs)
- [Vercel Edge Functions](https://vercel.com/docs/functions/edge-functions)
- [React 19 Documentation](https://react.dev/)

### Internal Resources
- GitHub Repository: (Add your repo URL)
- Vercel Dashboard: (Add your project URL)
- Supabase Dashboard: (Add your project URL)

---

**For questions or issues, see the main [README.md](../README.md) or create a GitHub issue.**
