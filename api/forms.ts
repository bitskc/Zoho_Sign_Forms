import { supabaseServer } from './_supabaseServer.js';
import { checkRateLimit, createRateLimitResponse, getRateLimitKey, RATE_LIMITS } from './utils/rateLimiter.js';
import { validateUrl, getUrlValidationError } from './utils/urlValidator.js';

export const config = { runtime: 'edge' };

async function getUserFromAuthHeader(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  const { data, error } = await supabaseServer.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

function toCamel(record: any) {
  if (!record) return record;
  
  // Convert snake_case landing_config keys to camelCase
  let landingConfig = record.landing_config;
  if (landingConfig && typeof landingConfig === 'object') {
    landingConfig = {
      headline: landingConfig.headline,
      description: landingConfig.description,
      logoUrl: landingConfig.logo_url,
      logoAlt: landingConfig.logo_alt,
      theme: landingConfig.theme ? {
        primaryColor: landingConfig.theme.primary_color,
        backgroundColor: landingConfig.theme.background_color,
        cardColor: landingConfig.theme.card_color,
        textColor: landingConfig.theme.text_color,
        mutedColor: landingConfig.theme.muted_color,
        accentColor: landingConfig.theme.accent_color,
        darkMode: landingConfig.theme.dark_mode
      } : undefined,
      contact: landingConfig.contact ? {
        companyName: landingConfig.contact.company_name,
        email: landingConfig.contact.email,
        phone: landingConfig.contact.phone,
        website: landingConfig.contact.website,
        address: landingConfig.contact.address
      } : undefined,
      footerText: landingConfig.footer_text,
      showPoweredBy: landingConfig.show_powered_by,

      buttonText: landingConfig.button_text
    };
  }
  
  return {
    id: record.id,
    userId: record.user_id,
    name: record.name,
    slug: record.slug,
    templateId: record.template_id,
    roleName: record.role_name,
    apiDomain: record.api_domain,
    accessToken: record.access_token,
    qrStableId: record.qr_stable_id,
    createdAt: record.created_at ? Date.parse(record.created_at as any) : null,
    landingConfig: landingConfig || undefined,
    qrCodeData: record.form_qrcodes?.[0]?.qr_code_data,
    qrStableIdFromDb: record.form_qrcodes?.[0]?.stable_id,
    qrCreatedAt: record.form_qrcodes?.[0]?.created_at
  };
}

export default async function handler(req: Request) {
  const table = 'forms';

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const slug = url.searchParams.get('slug');
    if (slug) {
      // For public form access, use IP-based rate limiting only (faster)
      const key = getRateLimitKey(req);
      const rateLimitResult = checkRateLimit(key, RATE_LIMITS.FORMS);
      
      if (!rateLimitResult.allowed) {
        return createRateLimitResponse(rateLimitResult);
      }
      
      // Try with landing_config and QR codes first, fall back to without if columns don't exist
      let data, error;
      try {
        const result = await supabaseServer
          .from(table)
          .select(`
            id,user_id,name,slug,template_id,role_name,api_domain,qr_stable_id,created_at,landing_config,
            form_qrcodes(qr_code_data, stable_id, created_at)
          `)
          .eq('slug', slug)
          .maybeSingle();
        data = result.data;
        error = result.error;
        
        // If error mentions landing_config or form_qrcodes columns, retry without them
        if (error?.message?.includes('landing_config') || error?.message?.includes('form_qrcodes')) {
          const fallbackResult = await supabaseServer
            .from(table)
            .select('id,user_id,name,slug,template_id,role_name,api_domain,qr_stable_id,created_at')
            .eq('slug', slug)
            .maybeSingle();
          data = fallbackResult.data;
          error = fallbackResult.error;
        }
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Database query failed' }), { status: 500 });
      }
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
      if (!data) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
      
      // Cache public form data for 60 seconds to reduce DB queries
      return new Response(JSON.stringify(toCamel(data)), { 
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
        }
      });
    }

    const user = await getUserFromAuthHeader(req);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    // Try with landing_config and QR codes first, fall back to without if columns don't exist
    let data, error;
    try {
      const result = await supabaseServer
        .from(table)
        .select(`
          id,user_id,name,slug,template_id,role_name,api_domain,access_token,qr_stable_id,created_at,landing_config,
          form_qrcodes(qr_code_data, stable_id, created_at)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      data = result.data;
      error = result.error;
      
      // If error mentions landing_config or form_qrcodes, retry with basic columns only
      if (error?.message?.includes('landing_config') || error?.message?.includes('form_qrcodes')) {
        const fallbackResult = await supabaseServer
          .from(table)
          .select('id,user_id,name,slug,template_id,role_name,api_domain,access_token,qr_stable_id,created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        data = fallbackResult.data;
        error = fallbackResult.error;
      }
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Database query failed' }), { status: 500 });
    }
    
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    return new Response(JSON.stringify((data || []).map(toCamel)), { status: 200 });
  }

  if (req.method === 'POST') {
    const user = await getUserFromAuthHeader(req);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const body = await req.json();
    
    // Validate URLs in landing config before saving
    if (body.landingConfig) {
      const lc = body.landingConfig;
      
      // Validate logo URL
      if (lc.logoUrl && !validateUrl(lc.logoUrl)) {
        return new Response(
          JSON.stringify({ 
            error: 'Invalid logo URL', 
            details: getUrlValidationError(lc.logoUrl)
          }), 
          { status: 400 }
        );
      }
      
      // Validate contact website URL
      if (lc.contact?.website && !validateUrl(lc.contact.website)) {
        return new Response(
          JSON.stringify({ 
            error: 'Invalid website URL', 
            details: getUrlValidationError(lc.contact.website)
          }), 
          { status: 400 }
        );
      }
    }
    
    // Convert camelCase landingConfig to snake_case for database
    let landingConfig = body.landingConfig;
    if (landingConfig && typeof landingConfig === 'object') {
      landingConfig = {
        headline: landingConfig.headline,
        description: landingConfig.description,
        logo_url: landingConfig.logoUrl,
        logo_alt: landingConfig.logoAlt,
        theme: landingConfig.theme ? {
          primary_color: landingConfig.theme.primaryColor,
          background_color: landingConfig.theme.backgroundColor,
          card_color: landingConfig.theme.cardColor,
          text_color: landingConfig.theme.textColor,
          muted_color: landingConfig.theme.mutedColor,
          accent_color: landingConfig.theme.accentColor,
          dark_mode: landingConfig.theme.darkMode
        } : undefined,
        contact: landingConfig.contact ? {
          company_name: landingConfig.contact.companyName,
          email: landingConfig.contact.email,
          phone: landingConfig.contact.phone,
          website: landingConfig.contact.website,
          address: landingConfig.contact.address
        } : undefined,
        footer_text: landingConfig.footerText,
        show_powered_by: landingConfig.showPoweredBy,
        button_text: landingConfig.buttonText
      };
    }
    
    const record: Record<string, any> = {
      id: body.id,
      user_id: user.id,
      name: body.name,
      slug: body.slug,
      template_id: body.templateId,
      role_name: body.roleName,
      api_domain: body.apiDomain,
      access_token: body.accessToken,
      // store as ISO for timestamptz column
      created_at: body.createdAt ? new Date(body.createdAt).toISOString() : new Date().toISOString()
    };
    
    // Only include landing_config if provided
    if (landingConfig) {
      record.landing_config = landingConfig;
    }

    const { data, error } = await supabaseServer
      .from(table)
      .upsert(record, { onConflict: 'id' })
      .select()
      .maybeSingle();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    return new Response(JSON.stringify(toCamel(data)), { status: 200 });
  }

  if (req.method === 'DELETE') {
    const user = await getUserFromAuthHeader(req);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });

    const { error } = await supabaseServer
      .from(table)
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
}
