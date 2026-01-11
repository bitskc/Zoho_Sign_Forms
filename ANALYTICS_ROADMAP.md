# Analytics Roadmap

## Feature: Daily Analytics Tracking with Date Range Filtering

### Overview
Add the ability to track analytics statistics by day and filter analytics data by custom time periods.

### Complexity Assessment
**Difficulty Level**: 5-6 out of 10 (Moderate)

---

## Current State ✅
- `form_analytics` table has `created_at` timestamps with full datetime data
- All events are stored with exact creation time
- Real data flowing from database (not fake/placeholder)
- PostgreSQL database supports date aggregation queries

---

## Implementation Roadmap

### Phase 1: Quick Version (2-3 hours)
**Goal**: Get basic daily tracking and filtering working

#### Backend Changes
- [ ] Modify `/api/analytics.ts` GET endpoint to:
  - Accept `fromDate` and `toDate` query parameters
  - Group analytics events by date using PostgreSQL
  - Return daily summary format:
    ```json
    {
      "2026-01-10": { visits: 5, submissions: 2, successfulSubmissions: 2, conversionRate: 40 },
      "2026-01-09": { visits: 3, submissions: 1, successfulSubmissions: 1, conversionRate: 33 },
      "2026-01-08": { visits: 8, submissions: 3, successfulSubmissions: 2, conversionRate: 25 }
    }
    ```
  - Default to last 30 days if no date range specified
  - Maintain backward compatibility (return overall summary as before)

#### Frontend Changes
- [ ] Add date filter UI in analytics tab:
  - "From Date" input field (type="date")
  - "To Date" input field (type="date")
  - "Apply Filters" button
  - "Last 7 days", "Last 30 days", "All time" preset buttons

- [ ] Add state management:
  - `analyticsFilterFromDate` state
  - `analyticsFilterToDate` state

- [ ] Update `fetchAnalytics()` to include date parameters

- [ ] Display daily breakdown:
  - Simple table format with Date | Visits | Submissions | Conversion Rate columns
  - Show daily totals below the table for selected period

#### Testing
- [ ] Test with various date ranges
- [ ] Test with no data in date range
- [ ] Test edge cases (future dates, same day range, etc.)

---

### Phase 2: Enhanced Version (4-5 hours) - Future
**Goal**: Better visualization and UX

#### Additional Frontend Enhancements
- [ ] Add visual chart of daily trends (using Chart.js or Recharts)
  - Bar chart showing visits/submissions over time
  - Line chart showing conversion rate trend

- [ ] Improve date picker:
  - Replace input fields with proper calendar widget (e.g., React Calendar)
  - Add "Last 7 days", "This month", "This quarter", "This year" presets
  - Add "Custom range" option

- [ ] Enhanced analytics display:
  - Toggle between table and chart views
  - Export data to CSV
  - Daily event list with expanded details

#### Backend Enhancements
- [ ] Add caching for frequently requested date ranges
- [ ] Performance optimization for large date ranges

---

## Database Queries Reference

### Sample PostgreSQL query for daily aggregation:
```sql
SELECT 
  DATE(created_at) as date,
  COUNT(CASE WHEN event_type = 'visit' THEN 1 END) as visits,
  COUNT(CASE WHEN event_type IN ('submit_start', 'submit_success') THEN 1 END) as submissions,
  COUNT(CASE WHEN event_type = 'submit_success' THEN 1 END) as successful_submissions,
  ROUND(
    (COUNT(CASE WHEN event_type = 'submit_success' THEN 1 END)::numeric / 
     NULLIF(COUNT(CASE WHEN event_type = 'visit' THEN 1 END), 0)) * 100, 
    2
  ) as conversion_rate
FROM form_analytics
WHERE form_id = $1 
  AND created_at >= $2 
  AND created_at < $3 + INTERVAL '1 day'
GROUP BY DATE(created_at)
ORDER BY date DESC
```

---

## Files to Modify

### Backend
- `api/analytics.ts` - Add date range grouping logic

### Frontend
- `App.tsx` - Add state for date filters, update analytics tab UI
- `types.ts` - Add DailyAnalyticsSummary interface if needed

---

## Performance Considerations

- **Index**: Ensure `form_analytics(form_id, created_at)` composite index exists
- **Query limit**: For very large datasets (>100k events), consider pagination or summary caching
- **Browser**: Date calculations should be done server-side, not client-side

---

## Success Criteria

✅ Can select custom date range for analytics
✅ Analytics display daily breakdown for selected period
✅ Preset filters work correctly ("Last 7 days", etc.)
✅ No performance degradation with date filtering
✅ Handles edge cases (no data, future dates, etc.)
✅ Mobile responsive (date inputs work on mobile)

---

## Notes

- Users will need to actively share their form URLs to generate analytics data (zero data is expected for new forms)
- Consider adding a "Share form" button next to empty analytics state
- Daily analytics are more useful for tracking trends than individual event logs

---

## Related Files & Documentation

- See [FEATURES.md](FEATURES.md) for current analytics feature overview
- See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for database migration process
- Supabase RLS policies configured in migration: `supabase/migrations/20260107_signflow_enhancements.sql`
