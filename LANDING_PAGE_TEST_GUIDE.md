# Landing Page Customization Test Checklist

## Customization Fields to Test

### 1. Headline
- **Input Field**: "Headline (optional)" text input
- **Expected Behavior**: Custom headline should replace the default form name on the public form
- **Location on Public Form**: Top of the form card
- **Status**: [ ] Working [ ] Not Working

### 2. Description  
- **Input Field**: "Description" textarea (3 rows)
- **Expected Behavior**: Custom description appears below the headline
- **Location on Public Form**: Below headline, above the form inputs
- **Status**: [ ] Working [ ] Not Working

### 3. Logo URL
- **Input Field**: "Logo URL" text input with placeholder
- **Expected Behavior**: Logo image displays at the top of the page
- **Location on Public Form**: Above the form card, centered
- **Status**: [ ] Working [ ] Not Working

### 4. Primary Color
- **Input Field**: Color picker + hex input (e.g., #3B82F6)
- **Expected Behavior**: Affects button background color and accent elements
- **Location on Public Form**: Button, icon backgrounds, links
- **Status**: [ ] Working [ ] Not Working

### 5. Background Color
- **Input Field**: Color picker + hex input (e.g., #F8FAFC)
- **Expected Behavior**: Changes the page background color
- **Location on Public Form**: Full page background behind the form card
- **Status**: [ ] Working [ ] Not Working

### 6. Button Text
- **Input Field**: "Button Text" text input (default "Sign Now")
- **Expected Behavior**: CTA button shows custom text instead of "Sign Now"
- **Location on Public Form**: Main submit button
- **Status**: [ ] Working [ ] Not Working

### 7. Company Name
- **Input Field**: "Company Name" text input
- **Expected Behavior**: Displays in the footer with bold styling
- **Location on Public Form**: Bottom of form card in footer section
- **Status**: [ ] Working [ ] Not Working

### 8. Email
- **Input Field**: "Email" text input with placeholder
- **Expected Behavior**: Displays in footer with mailto: link, separated by • from other contact info
- **Location on Public Form**: Bottom of form card in footer section
- **Status**: [ ] Working [ ] Not Working

### 9. Phone
- **Input Field**: "Phone" text input with placeholder
- **Expected Behavior**: Displays in footer with tel: link, separated by • from other contact info
- **Location on Public Form**: Bottom of form card in footer section
- **Status**: [ ] Working [ ] Not Working

### 10. Footer Text
- **Input Field**: "Footer Text" text input  
- **Expected Behavior**: Displays at the bottom of the page
- **Location on Public Form**: Very bottom of page, above "Powered by SignFlow"
- **Status**: [ ] Working [ ] Not Working

### 11. Show Powered By
- **Input Field**: Checkbox "Show 'Powered by SignFlow' badge"
- **Expected Behavior**: When checked, "Powered by SignFlow" appears at bottom; when unchecked, hidden
- **Location on Public Form**: Very bottom of page
- **Status**: [ ] Working [ ] Not Working

---

## Testing Steps

1. **Save a form with customizations**:
   - Edit any existing form
   - Click "Landing" tab
   - Fill in all customization fields
   - Click "Save Landing Page"
   - Verify success message appears

2. **View the public form**:
   - Visit the form's public URL (e.g., `https://yoursite.com/form-slug`)
   - Check if each customization is applied

3. **Reload and re-verify**:
   - Refresh the public form page
   - Check if customizations persist (not just cached)

4. **Check browser console**:
   - Open DevTools → Console
   - Look for any errors related to fetching form data

5. **Verify API responses**:
   - In DevTools → Network tab
   - Find the `/api/forms?slug=...` request
   - Click on it and view the Response tab
   - Check if `landingConfig` object contains all the customization data

---

## Potential Issues & Solutions

### Issue: Fields save but don't appear on public form

**Possible Causes**:
1. **Database column missing**: `landing_config` column not created in `forms` table
   - **Solution**: Run migration `20260110_landing_page_customization.sql` in Supabase
   
2. **API not returning data**: `/api/forms?slug=...` endpoint not including `landing_config`
   - **Solution**: Check `api/forms.ts` line 81-88 includes `landing_config` in SELECT
   
3. **Data not being saved**: Form submission not saving `landingConfig` object to database
   - **Solution**: Check `saveForm()` function in `App.tsx` (lines 777-872), verify `landingConfig` object is being built correctly

4. **Caching issue**: Browser or Cloudflare cache returning old data
   - **Solution**: Incognito/private window or add `?v=` query parameter

### Issue: Only some fields work, others don't

**Check these specific fields**:
- **Headline/Description**: Loaded from `lc.headline` at line 1897, rendered at line 1913
- **Colors**: Loaded from `lc.theme` at line 1847-1850, used inline via `style={{backgroundColor}}`
- **Footer**: Loaded from `lc.footerText` at line 1942
- **Contact Info**: Loaded from `lc.contact` at line 1931-1936

### Issue: Changes appear in admin form but not on public form

**Likely Cause**: Form data not being persisted to `currentForm` state after save

**Solution**: After successful API response in `saveForm()`, update the forms list and currentForm state

---

## Code Locations Reference

**Admin Form Inputs**: App.tsx lines 1563-1684 (Landing tab)
**Save Function**: App.tsx lines 719-805 (saveForm)
**Load Function**: App.tsx lines 733-780 (openFormDetails)
**Public Form Rendering**: App.tsx lines 1834-1950 (PUBLIC_FORM view)
**API Endpoint**: api/forms.ts lines 68-109 (GET with slug)
**Database Column**: supabase/migrations/20260110_landing_page_customization.sql
