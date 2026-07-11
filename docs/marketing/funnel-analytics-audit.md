# Funnel & Analytics Audit — SignFlow Pro

**Date:** 2026-07-11

## Current state

| Layer | Status | Evidence |
|---|---|---|
| GTM container | ✅ Installed on homepage/SPA (`GTM-5GMVHV6M` in `index.html`) and now on all `/guides/*` pages | `index.html`, `public/guides/**` |
| GA4 | ❓ Unknown from repo — GTM loads, but whether a GA4 tag is configured inside the container can only be checked in the GTM web UI | — |
| Custom dataLayer events | ❌ None. Zero `dataLayer.push` calls in app code — only pageviews are trackable | grep of `*.ts/tsx` |
| Product analytics (per-form) | ✅ Built — visits/submissions/conversion per form (`api/analytics.ts`) | tests: `analyticsTimezone.test.ts` |
| Stripe revenue reporting | ✅ Stripe dashboard is source of truth for MRR/churn | `api/stripe-*.ts` |

**Net:** signer-side analytics are good; **owner-side funnel is dark.** We cannot currently answer "how many homepage visitors sign up, how many signups connect Zoho, how many publish a form, how many pay."

## The funnel we need to see

```
Visit (home or guide) → Signup → Zoho connected → First form published → First submission → Paid
```

## Fixes, in order of effort

### 1. Zero-code, in GTM web UI (Andy, ~30 min)
- Confirm a **GA4 configuration tag** exists in `GTM-5GMVHV6M` and fires on all pages. If not, create GA4 property + tag.
- The SPA is hash-routed — enable **History Change trigger** (and hash change) so `#/admin/signup` vs `#/admin/dashboard` register as page views. This alone gives visit→signup-page conversion.
- Add **click triggers** on the CTA links (they have stable hrefs `#/admin/signup`) → GA4 event `cta_click` with page path as parameter. Captures guide-page → signup handoff.
- Link GA4 to Search Console once the guides are indexed (query-level SEO data).

### 2. Small code change (recommended follow-up PR)
Add a ~20-line `services/analyticsService.ts` with a safe `track(event, params)` wrapper around `window.dataLayer.push`, and call it at five points:

| Event | Where |
|---|---|
| `sign_up` | after successful Supabase signup |
| `zoho_connected` | after credentials saved + connection test passes |
| `form_published` | after form create succeeds |
| `checkout_started` | when Stripe checkout URL is requested |
| `subscription_active` | on return from Stripe success redirect |

With these five events GA4 shows the full activation funnel. (`purchase` truth stays in Stripe; `subscription_active` is directional.)

### 3. Weekly funnel report (once #1–2 exist)
One number per stage, week over week, plus per-guide sessions → CTA clicks. This can be automated later; manually reading GA4 weekly is fine at current volume.

## Guide pages — measurement plan
Each guide targets a query cluster; success = impressions/clicks in Search Console within 4–8 weeks:

| Page | Target queries |
|---|---|
| /guides/zoho-sign-shareable-link | "zoho sign shareable link", "zoho sign template link", "zoho sign public link" |
| /guides/zoho-sign-qr-code | "zoho sign qr code", "qr code to sign document" |
| /guides/zoho-sign-without-account | "sign zoho document without account", "zoho sign external signer" |
| /guides/docusign-powerforms-alternative | "docusign powerforms alternative", "zoho sign signforms alternative", "powerforms for zoho" |

**Action for Andy:** verify the site in Google Search Console (if not already) and submit `https://www.signflow.ink/sitemap.xml` after this deploys.
