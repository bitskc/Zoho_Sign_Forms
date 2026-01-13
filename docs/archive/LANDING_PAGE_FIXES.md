# Landing Page Customization - Issues & Solutions

## Issues You Mentioned

**"Several things in the landing page customizer aren't actually being reflected on the live page"**

This document systematically addresses what could cause this and what has been fixed.

---

## Root Causes & Fixes Applied

### ✅ Fix 1: clearForm() Not Resetting All Fields
**Problem**: When creating a new form, landing customization fields retained old values from previous edits

**Solution**: Updated `clearForm()` function to reset all 11 landing customization fields to defaults

**Files Modified**: `App.tsx` (lines 662-681)

```typescript
// Now includes:
setLandingHeadline('');
setLandingDescription('');
setLandingLogoUrl('');
setLandingPrimaryColor('#3B82F6');
setLandingBackgroundColor('#F8FAFC');
setLandingButtonText('Sign Now');
setLandingCompanyName('');
setLandingContactEmail('');
setLandingContactPhone('');
setLandingFooterText('');
setLandingShowPoweredBy(true);
```

---

### ✅ Fix 2: currentForm Not Updating After Save
**Problem**: After saving landing customizations, the form details page might show stale data because `currentForm` wasn't being updated

**Solution**: Added logic to update `currentForm` state after successful save, and stay on Landing tab

**Files Modified**: `App.tsx` (lines 817-822)

```typescript
// If we're viewing this form's details, also update currentForm with the latest data
if (selectedFormId === (editingId || saved.id)) {
  setCurrentForm(saved);
}

// Stay on landing tab after save
setDetailsTab('landing');
```

---

### ✅ Fix 3: Public Form Fetch Missing QR Codes
**Problem**: The public form fetch (by slug) wasn't including QR codes and might not fetch all necessary data

**Solution**: Updated API query to include `form_qrcodes` join and ensure `landing_config` is included

**Files Modified**: `api/forms.ts` (lines 81-88)

```typescript
const result = await supabaseServer
  .from(table)
  .select(`
    id,user_id,name,slug,template_id,role_name,api_domain,access_token,qr_stable_id,created_at,landing_config,
    form_qrcodes(qr_code_data, stable_id, created_at)
  `)
  .eq('slug', slug)
  .maybeSingle();
```

---

## Verification of System Components

### ✅ Data Storage
- Database column `landing_config` (JSONB) exists
- Migration file: `20260110_landing_page_customization.sql` ✓
- All 11 fields have database storage via JSONB

### ✅ State Management  
- All 11 customization fields have React state variables ✓
- Default values are properly initialized ✓
- clearForm() resets all fields ✓

### ✅ Admin Form UI
- Branding section: Logo, Colors, Button Text ✓
- Content section: Headline, Description ✓
- Contact section: Company, Email, Phone ✓
- Footer section: Footer Text ✓
- Options section: Show Powered By ✓

### ✅ Save Function
- Creates proper landingConfig object ✓
- Filters out undefined/empty values appropriately ✓
- Handles nested objects (theme, contact) correctly ✓
- Sends with Authorization header ✓

### ✅ API Endpoint
- Converts camelCase → snake_case for database ✓
- Converts snake_case → camelCase for response ✓
- Handles nested object conversions ✓
- Preserves data during round-trip ✓

### ✅ Public Form Rendering
- All 11 fields are used in rendering ✓
- Logo displays conditionally ✓
- Colors apply via inline styles ✓
- Contact info shows conditionally ✓
- Footer text displays conditionally ✓
- "Powered by" badge shows conditionally ✓

### ✅ Load Function
- openFormDetails() loads all customization fields ✓
- Maps database fields to state variables ✓
- Handles missing/undefined values gracefully ✓

---

## Remaining Potential Issues to Debug

If customizations still aren't showing on the public form after these fixes, check:

### 1. Database Column Issue
```sql
-- Check if landing_config column exists:
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name='forms' AND column_name='landing_config';

-- Should return: landing_config | jsonb
```

### 2. Network Request
Open browser DevTools → Network tab:
- Find request: `GET /api/forms?slug=your-form-slug`
- Check Response tab
- Should contain `"landingConfig": { ... }`
- If missing, API query isn't including it

### 3. Form Data Persistence
- Edit a form's Landing tab
- Click Save
- Check API response status (should be 200)
- Reload page - saved values should still be there
- If not, check browser console for errors

### 4. Cache Issue
- Hard refresh: `Ctrl+Shift+R` or `Cmd+Shift+R`
- Or use incognito/private window
- Or check browser DevTools → Application → Cache Storage

### 5. Specific Field Not Showing
For each field, verify:
- State variable exists in App.tsx
- Input/control exists in admin form
- Value is included in landingConfig object on save
- Field is rendered in PUBLIC_FORM view
- No CSS is hiding the element

---

## Step-by-Step Test

### Step 1: Create a Test Form
1. Log in to admin
2. Create new form with slug: `test-landing`
3. Fill in just ONE customization field (e.g., headline: "Test Headline")
4. Click "Save Landing Page"
5. Verify success message

### Step 2: Check Database Directly
In Supabase SQL Editor:
```sql
SELECT id, slug, landing_config 
FROM forms 
WHERE slug = 'test-landing'
LIMIT 1;
```
Should see JSON with your customization

### Step 3: Check API Response
1. Open DevTools → Network
2. Visit public form: `/test-landing`
3. Find request to `/api/forms?slug=test-landing`
4. Check Response tab - should include `landingConfig` object

### Step 4: Check Frontend
1. Reload form details admin page
2. Go to Landing tab
3. Verify your value is still there (loaded from database)
4. Check the public form URL
5. Verify customization displays

### Step 5: Add More Fields
Repeat Step 1-4 for each of the 11 fields to identify which ones work and which don't

---

## Debugging Commands

### Check if migrations have run
```javascript
// In browser console:
const response = await fetch('/api/forms?slug=test-form');
const data = await response.json();
console.log(JSON.stringify(data.landingConfig, null, 2));
```

### Verify state in React DevTools
Install React DevTools extension, find App component, check:
- `landingHeadline` value
- `landingPrimaryColor` value
- Any other field not showing

### Check console for errors
Open browser DevTools → Console tab
Look for any fetch/network errors related to `/api/forms`

---

## Expected Behavior After Fixes

1. **Creating New Form**: All fields cleared to defaults
2. **Saving Form**: Values persisted to database immediately
3. **Editing Form**: Previously saved values load in admin form
4. **Public Form**: All customizations display on first load
5. **Refreshing**: Customizations persist (not just cached)
6. **All 11 Fields**: Each independently working and rendering

---

## If Issues Persist

Provide these details:
1. Which specific field(s) aren't working? (e.g., "Primary Color", "Headline")
2. Does the value save in the admin form? (reload and check it's still there)
3. Does it appear in the API response? (check Network tab)
4. Any errors in browser console?
5. What color/values are you trying to set?

This will help pinpoint exactly where in the chain the issue occurs.
