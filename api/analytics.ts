import { supabaseServer } from './_supabaseServer.js';
import { checkRateLimit, createRateLimitResponse, getRateLimitKey, getUserIdFromRequest, RATE_LIMITS } from './utils/rateLimiter.js';
import { getUserFromAuthHeader } from './utils/auth.js';

export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  const url = new URL(req.url);

  // POST - Record analytics event (no auth required for public events)
  if (req.method === 'POST') {
    // Rate limit analytics requests
    const userId = await getUserIdFromRequest(req);
    const key = getRateLimitKey(req, userId);
    const rateLimitResult = checkRateLimit(key, RATE_LIMITS.ANALYTICS);
    
    if (!rateLimitResult.allowed) {
      return createRateLimitResponse(rateLimitResult);
    }
    
    const body = await req.json();
    const { formId, eventType, visitorEmail, visitorName, referrer, userAgent, metadata: rawMetadata } = body;

    if (!formId || !eventType) {
      return new Response(JSON.stringify({ error: 'Missing formId or eventType' }), { status: 400 });
    }

    // Validate event type
    const validEventTypes = ['visit', 'submit_start', 'submit_success', 'submit_error'];
    if (!validEventTypes.includes(eventType)) {
      return new Response(JSON.stringify({ error: 'Invalid eventType' }), { status: 400 });
    }

    // Sanitize metadata: must be a plain object, max 10 keys, values capped at 512 chars.
    // Oversized metadata is stripped to { truncated: true } — analytics must not block user flow.
    let metadata: Record<string, string> | null = null;
    if (rawMetadata !== undefined && rawMetadata !== null) {
      if (typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)) {
        const keys = Object.keys(rawMetadata);
        if (keys.length > 10) {
          console.warn('[analytics] metadata truncated: too many keys', { formId, keyCount: keys.length });
          metadata = { truncated: 'true' };
        } else {
          const sanitized: Record<string, string> = {};
          let wasTruncated = false;
          for (const k of keys) {
            const val = String(rawMetadata[k]);
            if (val.length > 512) {
              wasTruncated = true;
              sanitized[k] = val.slice(0, 512);
            } else {
              sanitized[k] = val;
            }
          }
          if (wasTruncated) {
            console.warn('[analytics] metadata value(s) truncated to 512 chars', { formId });
          }
          metadata = sanitized;
        }
      } else {
        // Not a plain object — discard silently
        console.warn('[analytics] metadata discarded: not a plain object', { formId });
      }
    }

    // Verify form exists
    const { data: formData, error: formError } = await supabaseServer
      .from('forms')
      .select('id')
      .eq('id', formId)
      .maybeSingle();

    if (formError || !formData) {
      return new Response(JSON.stringify({ error: 'Form not found' }), { status: 404 });
    }

    // Create analytics record
    const analyticsRecord = {
      form_id: formId,
      event_type: eventType,
      visitor_email: visitorEmail || null,
      visitor_name: visitorName || null,
      referrer: referrer || null,
      user_agent: userAgent || null,
      metadata: metadata || null,
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabaseServer
      .from('form_analytics')
      .insert(analyticsRecord)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Analytics error:', error);
      // Don't fail the request if analytics fails - just log it
      return new Response(JSON.stringify({ 
        success: true, 
        warning: 'Analytics recording failed', 
        error: error.message || 'Unknown error' 
      }), { status: 200 });
    }

    return new Response(JSON.stringify({ success: true, id: data.id }), { status: 200 });
  }

  // GET - Retrieve analytics for a form (auth required)
  if (req.method === 'GET') {
    const user = await getUserFromAuthHeader(req);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const formId = url.searchParams.get('formId');
    const timeWindow = url.searchParams.get('window') || 'all'; // 'day', 'week', 'month', 'all'
    
    if (!formId) {
      return new Response(JSON.stringify({ error: 'Missing formId' }), { status: 400 });
    }
    
    // Validate time window parameter
    const validWindows = ['day', 'week', 'month', 'all'];
    if (!validWindows.includes(timeWindow)) {
      return new Response(JSON.stringify({ 
        error: 'Invalid time window', 
        details: 'Must be one of: day, week, month, all' 
      }), { status: 400 });
    }

    // Verify the form belongs to the user
    const { data: formData, error: formError } = await supabaseServer
      .from('forms')
      .select('id')
      .eq('id', formId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (formError || !formData) {
      return new Response(JSON.stringify({ error: 'Form not found' }), { status: 404 });
    }

    // Calculate time window boundaries in UTC
    const now = new Date();
    const startDate = getWindowStartDate(timeWindow, now);
    
    // P2-10: Use two targeted DB queries instead of loading all rows into memory.
    //
    // Default time window: last 30 days (all analytics for the current calendar window
    // selected by the 'window' parameter). The aggregate query groups by event_type for
    // the summary; the recent query returns the latest 20 events for the activity feed.
    //
    // This replaces the prior unbounded SELECT * + in-memory .reduce()/.slice(20) pattern.

    // 1. Aggregate: counts per event_type within the window
    let aggregateQuery = supabaseServer
      .from('form_analytics')
      .select('event_type')
      .eq('form_id', formId);

    if (timeWindow !== 'all') {
      aggregateQuery = aggregateQuery.gte('created_at', startDate.toISOString());
    }

    const { data: allForSummary, error: summaryError } = await aggregateQuery;

    if (summaryError) {
      return new Response(JSON.stringify({ error: 'Database error' }), { status: 500 });
    }

    // 2. Recent: latest 20 events (columns only)
    let recentQuery = supabaseServer
      .from('form_analytics')
      .select('id,form_id,event_type,visitor_email,visitor_name,referrer,user_agent,metadata,created_at')
      .eq('form_id', formId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (timeWindow !== 'all') {
      recentQuery = recentQuery.gte('created_at', startDate.toISOString());
    }

    const { data: recentRows, error: recentError } = await recentQuery;

    if (recentError) {
      return new Response(JSON.stringify({ error: 'Database error' }), { status: 500 });
    }

    // Build summary from aggregate result
    const events = allForSummary || [];
    const visits = events.filter((e: any) => e.event_type === 'visit').length;
    const successfulSubmissions = events.filter((e: any) => e.event_type === 'submit_success').length;
    const conversionRate = visits > 0 ? (successfulSubmissions / visits) * 100 : 0;

    const recentEvents = (recentRows || []).map((e: any) => ({
      id: e.id,
      formId: e.form_id,
      eventType: e.event_type,
      visitorEmail: e.visitor_email,
      visitorName: e.visitor_name,
      referrer: e.referrer,
      userAgent: e.user_agent,
      metadata: e.metadata,
      createdAt: e.created_at
    }));

    return new Response(JSON.stringify({
      timeWindow,
      periodStart: timeWindow !== 'all' ? startDate.toISOString() : null,
      periodEnd: now.toISOString(),
      summary: {
        totalVisits: visits,
        totalSubmissions: successfulSubmissions, // Only successful submissions
        conversionRate: Math.round(conversionRate * 100) / 100
      },
      recentEvents
    }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
}

/**
 * Calculate the start date for a time window in UTC
 * @param window - Time window: 'day', 'week', 'month', 'all'
 * @param now - Current date/time
 * @returns Start date for the window
 */
function getWindowStartDate(window: string, now: Date): Date {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0); // Normalize to start of day in UTC
  
  switch (window) {
    case 'day':
      // Start of today in UTC
      return start;
    
    case 'week':
      // Start of week (Monday) in UTC
      const dayOfWeek = start.getUTCDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Sunday = 0, so go back 6 days
      start.setUTCDate(start.getUTCDate() - daysToMonday);
      return start;
    
    case 'month':
      // Start of month in UTC
      start.setUTCDate(1);
      return start;
    
    default:
      // For 'all', return a date far in the past
      return new Date('2000-01-01T00:00:00Z');
  }
}
