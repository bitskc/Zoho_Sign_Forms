# Deployment Guide for SignFlow Pro Enhancements

This guide covers the remaining deployment steps after the database migration has been completed.

## ✅ Completed Steps

- [x] Database migration run manually (form_qrcodes, form_analytics tables created)
- [x] Code changes committed and pushed to branch
- [x] All tests passing locally
- [x] Security scan completed (0 vulnerabilities)

## 🚀 Remaining Deployment Steps

### Step 1: Configure Environment Variables (Required)

Set the following environment variable in your Vercel project settings:

```bash
PUBLIC_URL=https://your-production-domain.com
```

**Where to set this:**
1. Go to your Vercel project dashboard
2. Navigate to Settings → Environment Variables
3. Add `PUBLIC_URL` with your production domain (e.g., `https://www.signflow.ink`)
4. Apply to Production, Preview, and Development environments

**Why this is needed:**
- QR codes use this URL to generate stable redirect links
- Prevents security vulnerabilities from using client-provided headers

### Step 2: Deploy to Production

Once the PR is merged to main:

```bash
# Option A: Automatic deployment (if Vercel is connected to GitHub)
# Vercel will automatically deploy when PR is merged

# Option B: Manual deployment via Vercel CLI
vercel deploy --prod
```

### Step 3: Verify Deployment

After deployment, verify these features are working:

#### 3.1 Test QR Code Generation
1. Log into your dashboard
2. Create or select an existing form
3. Click "Generate QR Code" button
4. Verify QR code appears
5. Click "Download QR" to save the image
6. Scan the QR code with your phone - it should redirect to the form

#### 3.2 Test Analytics Tracking
1. Visit a public form (in incognito mode)
2. Fill out the form and submit
3. Go back to dashboard
4. Click "View Analytics" on the form
5. Verify you see:
   - Visit count increased
   - Submission attempt recorded
   - Conversion metrics displayed

#### 3.3 Test Direct Redirect
1. Visit a public form
2. Enter name and email
3. Click "Sign Now"
4. **Expected:** You should be redirected directly to Zoho Sign embedded interface
5. **If not working:** Check these:
   - Verify your domain is whitelisted in Zoho Sign settings
   - Check browser console for errors
   - Review Vercel function logs

### Step 4: Whitelist Your Domain in Zoho Sign (Critical)

For the direct redirect to work, your domain must be whitelisted:

1. Log into [Zoho Sign](https://sign.zoho.com)
2. Go to **Settings** → **Integrations** → **Embed Sign**
3. Add your production domain to the whitelist:
   - `https://www.signflow.ink` (or your domain)
   - Include both `www` and non-`www` versions if needed
4. Save settings

**Without this step, users will receive email links instead of direct redirects.**

### Step 5: Monitor for Errors

After deployment, monitor these:

#### Vercel Function Logs
- Go to Vercel Dashboard → Your Project → Functions
- Check logs for `/api/qrcodes`, `/api/analytics`, `/api/zoho` endpoints
- Look for any errors related to:
  - Database connection issues
  - QR code generation failures
  - Analytics tracking errors
  - Zoho API errors

#### Common Issues and Solutions

**Issue: QR Codes Not Generating**
- **Cause:** Missing `qrcode` npm package
- **Solution:** Verify `package.json` includes `"qrcode": "^1.5.3"`
- **Solution:** Redeploy to ensure dependencies are installed

**Issue: Analytics Not Recording**
- **Cause:** Database tables missing or permissions issue
- **Solution:** Verify migration was run successfully
- **Solution:** Check Supabase logs for errors
- **Solution:** Verify `SUPABASE_SERVICE_ROLE` environment variable is set

**Issue: Direct Redirect Not Working**
- **Cause:** Domain not whitelisted in Zoho Sign
- **Solution:** Follow Step 4 above
- **Cause:** Embed token API call failing
- **Solution:** Check Vercel function logs for Zoho API errors
- **Solution:** Verify Zoho credentials are still valid

**Issue: QR Code Redirect Returns 404**
- **Cause:** Vercel routing not configured
- **Solution:** Verify `vercel.json` includes QR redirect rule
- **Solution:** Redeploy to apply routing changes

### Step 6: Test End-to-End Workflow

Complete this test scenario:

1. **Create a new form** in dashboard
2. **Generate QR code** for the form
3. **Download QR code** image
4. **Print or display QR code** (or test on phone)
5. **Scan QR code** with phone camera
6. **Should redirect to form page**
7. **Fill out form** with test data
8. **Submit form**
9. **Should redirect directly to Zoho Sign**
10. **Complete signing** in Zoho
11. **Go back to dashboard**
12. **View analytics** - should show:
    - 1 visit (from QR scan)
    - 1 submission attempt
    - 1 successful submission

If all steps work, deployment is successful! 🎉

## 📊 Monitoring & Maintenance

### Daily Checks
- Monitor analytics for unusual patterns
- Check error rates in Vercel logs
- Verify QR code redirects are working

### Weekly Checks
- Review form submission success rates
- Check for any failed Zoho API calls
- Verify database storage isn't growing unexpectedly

### Monthly Checks
- Review and potentially purge old analytics data (90+ days)
- Audit QR codes - remove unused ones
- Update dependencies if security patches are available

## 🆘 Rollback Plan

If issues occur after deployment:

### Option 1: Revert in Vercel
1. Go to Vercel Dashboard → Deployments
2. Find the previous working deployment
3. Click "..." → "Promote to Production"

### Option 2: Revert Database Changes
```sql
-- Only if absolutely necessary
DROP TABLE IF EXISTS form_analytics CASCADE;
DROP TABLE IF EXISTS form_qrcodes CASCADE;
ALTER TABLE forms DROP COLUMN IF EXISTS qr_stable_id;
```

**Note:** This will lose all analytics data and QR codes!

## 📞 Support

If you encounter issues not covered in this guide:

1. Check Vercel function logs for error details
2. Check Supabase logs for database errors
3. Review `FEATURES.md` for detailed feature documentation
4. Check browser console for client-side errors

## Summary of What's New

After deployment, users will be able to:

✅ **Generate persistent QR codes** for forms that work even if URLs change
✅ **Track detailed analytics** on form visits and submissions  
✅ **Experience direct redirects** to Zoho Sign (no email required)
✅ **Enjoy cleaner UI** with professional styling
✅ **Access login/signup** from any page via header

The implementation is production-ready and secure with 0 vulnerabilities found during scanning.
