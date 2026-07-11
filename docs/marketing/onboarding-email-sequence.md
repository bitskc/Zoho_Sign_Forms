# Onboarding Email Sequence — SignFlow Pro

Five emails. Goal: get every signup from "created account" to "first form published and first signature collected" — the activation events that predict renewal.

Prerequisite (eng): there is currently **no transactional email sending in the product**. These need an ESP (Resend is the pattern used elsewhere in the portfolio) triggered off Supabase auth events + form/submission events. Until that's wired, Andy can send #1 and #3 manually to new signups — at current volume that's viable and doubles as customer development.

---

## Email 1 — Welcome (immediately on signup)

**Subject:** Your first signing link is 5 minutes away

Hi {{first_name|there}},

Welcome to SignFlow Pro. Here's the whole setup, honestly timed at about five minutes:

1. **Connect Zoho Sign** — paste your API client ID and secret (guide: how to create them in the Zoho console → [link])
2. **Pick a template** — we list everything already in your Zoho Sign account
3. **Publish** — you get a permanent link + QR code

The most common snag is step 1 (Zoho's API console is not their finest work). If you get stuck for more than a few minutes, just reply to this email — I'll get you unstuck personally.

— Andy, SignFlow Pro

---

## Email 2 — Nudge if no Zoho connection after 48h

**Subject:** Stuck on the Zoho API step? (most people are)

Hi {{first_name|there}},

You created a SignFlow Pro account but haven't connected Zoho Sign yet — and in my experience that means Zoho's API console won. Two-minute version:

1. Go to api-console.zoho.com → "Add Client" → "Self Client"
2. Copy the Client ID and Secret into SignFlow Pro
3. Make sure your Zoho Sign plan has API access enabled (Settings → Integrations)

Full walkthrough with screenshots: [link]

Reply if it fights you — I answer these myself.

— Andy

---

## Email 3 — First form published (triggered on publish)

**Subject:** Your link is live — 3 places to put it

{{form_name}} is live at {{form_url}} 🎉

The link only earns money when people see it. The three placements that work best:

1. **Email signature** — "Need our service agreement? Sign here" (highest volume for most customers)
2. **The QR code, printed** — counter card, clipboard placard, job-site sign. Download it from your dashboard; it survives renames, so laminate away.
3. **Your website** — link it, or embed the signing page directly ([embed guide])

Your dashboard shows visits vs. submissions per form, so you'll know which placement is pulling weight.

— Andy

---

## Email 4 — First signature collected (triggered on first submission)

**Subject:** First signature ✅ — here's what most people do next

Someone just signed {{form_name}} — the document is in your Zoho Sign account with the full audit trail.

Now that the loop works, the highest-leverage next step: **publish the rest of your repeat documents.** Most customers have 3–5 (agreement, waiver, W-9, intake, NDA). Each takes ~2 minutes now that Zoho is connected, and each one deletes a category of email tag.

Multi-role tip: if a document needs your countersignature, set the remaining role to route to your email automatically — you sign right after they do.

— Andy

---

## Email 5 — Day 30 check-in / feedback (all active accounts)

**Subject:** One question, 30 days in

Hi {{first_name|there}},

You've been on SignFlow Pro a month. One question, honestly asked: **what's the one thing it should do that it doesn't?**

I read and answer every reply. The last few features (embeddable pages, multi-role routing, per-role delivery settings) all came from these emails.

And if it's earning its keep, a review on the Zoho Marketplace [link] genuinely helps a tiny tool get found.

— Andy

---

## Trigger map (for implementation)

| # | Trigger | Suppress if |
|---|---------|-------------|
| 1 | `auth.user.created` | — |
| 2 | 48h after signup, no `credentials` row | Zoho connected |
| 3 | first `forms` row for user | — |
| 4 | first submission event for user | — |
| 5 | 30 days after signup | account cancelled |
