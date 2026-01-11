import { supabaseServer } from './_supabaseServer.js';
import { checkRateLimit, createRateLimitResponse, getRateLimitKey, getUserIdFromRequest, RATE_LIMITS } from './utils/rateLimiter.js';

export const config = { runtime: 'edge' };

async function getUserFromAuthHeader(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  const { data, error } = await supabaseServer.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

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
    const { formId, eventType, visitorEmail, visitorName, referrer, userAgent, metadata } = body;

    if (!formId || !eventType) {
      return new Response(JSON.stringify({ error: 'Missing formId or eventType' }), { status: 400 });
    }

    // Validate event type
    const validEventTypes = ['visit', 'submit_start', 'submit_success', 'submit_error'];
    if (!validEventTypes.includes(eventType)) {
      return new Response(JSON.stringify({ error: 'Invalid eventType' }), { status: 400 });
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
    
    // Build query with time window filter
    let query = supabaseServer
      .from('form_analytics')
      .select('*')
      .eq('form_id', formId);
    
    // Apply time filter if not 'all'
    if (timeWindow !== 'all') {
      query = query.gte('created_at', startDate.toISOString());
    }
    
    query = query.order('created_at', { ascending: false });

    const { data: allEvents, error: eventsError } = await query;

    if (eventsError) {
      return new Response(JSON.stringify({ error: eventsError.message }), { status: 400 });
    }

    // Calculate summary statistics with improved logic
    const events = allEvents || [];
    const visits = events.filter(e => e.event_type === 'visit').length;
    const successfulSubmissions = events.filter(e => e.event_type === 'submit_success').length;
    
    // Conversion rate = successful submissions / visits (excluding submit_start)
    const conversionRate = visits > 0 ? (successfulSubmissions / visits) * 100 : 0;

    // Get recent events (last 20)
    const recentEvents = events.slice(0, 20).map(e => ({
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
