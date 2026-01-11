# Phase 1 Manual Testing Checklist

**Purpose:** Manual verification checklist for Phase 1 security fixes  
**When to use:** After deployment to staging/production  
**Estimated time:** 15 minutes

---

## Pre-Testing Setup

- [ ] Application deployed to staging/production environment
- [ ] Database migration `20260111_forms_rls.sql` applied
- [ ] Admin account available for testing
- [ ] Browser DevTools console open (check for errors)

---

## Test 1: CSS Injection Removal ✅

**Verify:** `customCss` field no longer exists or injects code

### Steps:
1. [ ] Log in as admin
2. [ ] Create or edit a form
3. [ ] Go to "Landing Page" tab
4. [ ] Verify: No "Custom CSS" input field visible
5. [ ] Save form
6. [ ] Open public form page (`/your-slug`)
7. [ ] Open browser DevTools → Elements tab
8. [ ] Search for `<style>` tags in the DOM
9. [ ] Verify: No `<style>` tags with user-provided CSS

### Expected Result:
✅ No custom CSS field in admin UI  
✅ No `<style>` tags with potentially malicious content  
✅ Public form renders normally with default styling

### If Fails:
- Check that build includes latest changes
- Verify no browser cache issues (hard refresh: Ctrl+Shift+R)

---

## Test 2: URL Validation - Logo URL 🔒

**Verify:** Only HTTPS URLs accepted, private IPs rejected

### Test 2a: Valid HTTPS URL
1. [ ] Edit a form → Landing Page tab
2. [ ] Enter logo URL: `https://via.placeholder.com/150`
3. [ ] Click "Save Changes"
4. [ ] Expected: ✅ Saves successfully, no error

### Test 2b: Reject HTTP URL
1. [ ] Edit logo URL to: `http://example.com/logo.png`
2. [ ] Click "Save Changes"
3. [ ] Expected: ❌ Error message: "Logo URL must use HTTPS"

### Test 2c: Reject localhost
1. [ ] Enter logo URL: `https://localhost/logo.png`
2. [ ] Click "Save Changes"  
3. [ ] Expected: ❌ Error message about invalid/unsafe URL

### Test 2d: Reject Private IP (192.168.x.x)
1. [ ] Enter logo URL: `https://192.168.1.1/logo.png`
2. [ ] Click "Save Changes"
3. [ ] Expected: ❌ Error message about private IP not allowed

### Test 2e: Reject Private IP (10.x.x.x)
1. [ ] Enter logo URL: `https://10.0.0.1/logo.png`
2. [ ] Click "Save Changes"
3. [ ] Expected: ❌ Error message about private IP not allowed

### Test 2f: Reject AWS Metadata (SSRF)
1. [ ] Enter logo URL: `https://169.254.169.254/latest/meta-data/`
2. [ ] Click "Save Changes"
3. [ ] Expected: ❌ Error message about invalid URL

### Test 2g: Reject javascript: URI
1. [ ] Enter logo URL: `javascript:alert('XSS')`
2. [ ] Click "Save Changes"
3. [ ] Expected: ❌ Error message about invalid URL format

### Test 2h: Allow Empty URL
1. [ ] Clear logo URL field (leave blank)
2. [ ] Click "Save Changes"
3. [ ] Expected: ✅ Saves successfully (optional field)

---

## Test 3: Row-Level Security (RLS) 🔐

**Verify:** Users can only access their own forms

### Test 3a: User Can See Own Forms
1. [ ] Log in as User A
2. [ ] Create a form "Test Form A" with slug `test-a`
3. [ ] Go to dashboard
4. [ ] Expected: ✅ "Test Form A" visible in list

### Test 3b: User Cannot See Other User's Forms (via API)
**Note:** This test requires API access or browser DevTools

1. [ ] As User A, note the auth token (from DevTools → Application → Storage)
2. [ ] Create User B account, create form "Test Form B" with slug `test-b`
3. [ ] Note form ID for "Test Form B"
4. [ ] As User A, try to fetch User B's form via API:
   ```bash
   curl -X GET "https://your-app.com/api/forms" \
     -H "Authorization: Bearer USER_A_TOKEN"
   ```
5. [ ] Expected: ✅ Response only contains User A's forms, not "Test Form B"

### Test 3c: Public Forms Accessible by Slug
1. [ ] As User A, create public form with slug `public-test`
2. [ ] Log out
3. [ ] Visit `/public-test` (not logged in)
4. [ ] Expected: ✅ Form renders correctly for anonymous users

### Test 3d: Admin Cannot Delete Other User's Forms (via API)
**Note:** Advanced test - optional if API testing is available

1. [ ] As User A, note form ID for own form
2. [ ] As User B, attempt DELETE request to User A's form:
   ```bash
   curl -X DELETE "https://your-app.com/api/forms?id=USER_A_FORM_ID" \
     -H "Authorization: Bearer USER_B_TOKEN"
   ```
3. [ ] Expected: ❌ 403/404 error, form not deleted

---

## Test 4: Regression Testing 🔄

**Verify:** No existing functionality broken

### Test 4a: Form Creation Still Works
1. [ ] Create new form with all required fields
2. [ ] Expected: ✅ Form created successfully

### Test 4b: Form Editing Still Works
1. [ ] Edit existing form, change name and template ID
2. [ ] Expected: ✅ Changes saved

### Test 4c: Public Form Submission Works
1. [ ] Visit public form page
2. [ ] Fill in name and email
3. [ ] Click submit
4. [ ] Expected: ✅ Zoho Sign document created

### Test 4d: Landing Page Customization Works
1. [ ] Edit form → Landing Page tab
2. [ ] Change headline, description, colors
3. [ ] Save
4. [ ] Visit public page
5. [ ] Expected: ✅ Custom branding applied

### Test 4e: Analytics Still Track Events
1. [ ] Visit public form page
2. [ ] Go to admin → form details → Analytics tab
3. [ ] Expected: ✅ Visit event recorded

### Test 4f: QR Code Generation Works
1. [ ] Go to form details → QR Code tab
2. [ ] Expected: ✅ QR code displays

---

## Test 5: Browser Console Check 🐛

**Verify:** No JavaScript errors

1. [ ] Open browser DevTools → Console
2. [ ] Navigate through:
   - [ ] Admin dashboard
   - [ ] Form creation
   - [ ] Form editing
   - [ ] Landing page customization
   - [ ] Public form page
3. [ ] Expected: ✅ No red errors in console (warnings OK)

---

## Test 6: Build & Performance ⚡

**Verify:** Application still performs well

1. [ ] Check Lighthouse score (DevTools → Lighthouse)
   - [ ] Performance > 80
   - [ ] Accessibility > 90
   - [ ] Best Practices > 90

2. [ ] Check network tab:
   - [ ] Page load < 3 seconds
   - [ ] No failed requests (red)

---

## Test Results Summary

**Date Tested:** _______________  
**Environment:** [ ] Staging [ ] Production  
**Tested By:** _______________

### Results:
- [ ] All URL validation tests passed
- [ ] RLS policies working correctly
- [ ] No CSS injection possible
- [ ] No regressions found
- [ ] No console errors

### Issues Found:
_Document any issues here_

---

### Sign-Off:
- [ ] **QA Engineer:** All tests passed, ready for production
- [ ] **Security Review:** Security fixes verified
- [ ] **Product Manager:** User experience acceptable

---

## Troubleshooting

### Issue: URL validation not working
**Solution:** Verify `api/utils/urlValidator.ts` is deployed and imported in `api/forms.ts`

### Issue: RLS migration not applied
**Solution:** Run `supabase db push` or apply migration manually

### Issue: Forms not loading
**Solution:** Check browser console for errors, verify Supabase connection

### Issue: Public forms show 404
**Solution:** Verify form slug is correct and RLS policies allow public SELECT

---

## Additional Security Tests (Optional)

### SQL Injection Test
1. [ ] Try entering `'; DROP TABLE forms; --` in form name
2. [ ] Expected: ✅ Saved as literal string, no SQL executed

### XSS in Form Fields
1. [ ] Enter `<script>alert('XSS')</script>` in headline field
2. [ ] View public form
3. [ ] Expected: ✅ Displayed as text, not executed

### CSRF Token (if applicable)
1. [ ] Check if forms have CSRF protection
2. [ ] Expected: ✅ Unauthorized requests blocked

---

**Checklist Version:** 1.0  
**Last Updated:** 2026-01-11
