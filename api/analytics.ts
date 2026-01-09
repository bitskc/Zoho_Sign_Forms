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
    if (!formId) {
      return new Response(JSON.stringify({ error: 'Missing formId' }), { status: 400 });
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

    // Get analytics summary
    const { data: allEvents, error: eventsError } = await supabaseServer
      .from('form_analytics')
      .select('*')
      .eq('form_id', formId)
      .order('created_at', { ascending: false });

    if (eventsError) {
      return new Response(JSON.stringify({ error: eventsError.message }), { status: 400 });
    }

    // Calculate summary statistics
    const events = allEvents || [];
    const visits = events.filter(e => e.event_type === 'visit').length;
    const submissions = events.filter(e => 
      e.event_type === 'submit_success' || e.event_type === 'submit_start'
    ).length;
    const successfulSubmissions = events.filter(e => e.event_type === 'submit_success').length;
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
      summary: {
        totalVisits: visits,
        totalSubmissions: submissions,
        successfulSubmissions,
        conversionRate: Math.round(conversionRate * 100) / 100
      },
      recentEvents
    }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
}
