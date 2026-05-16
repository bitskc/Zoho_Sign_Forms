import { supabaseServer } from './_supabaseServer.js';
import { checkRateLimit, createRateLimitResponse, getRateLimitKey, RATE_LIMITS } from './utils/rateLimiter.js';
import { validateUrl, getUrlValidationError } from './utils/urlValidator.js';
import { getUserFromAuthHeader } from './utils/auth.js';

export const config = { runtime: 'edge' };

const JSON_HEADERS: HeadersInit = { 'Content-Type': 'application/json' };
const PRIVATE_JSON_HEADERS: HeadersInit = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
};

const RESERVED_SLUGS = ['api', 'admin', 'assets', 'static', 'public', '_next', 'favicon.ico', 'qr', 'embed'];

function isValidSlug(slug: unknown): slug is string {
  if (typeof slug !== 'string') return false;
  if (!/^[a-z0-9-]+$/.test(slug)) return false;
  return !RESERVED_SLUGS.includes(slug.toLowerCase());
}

function toCamel(record: any, options?: { publicView?: boolean }) {
  if (!record) return record;
  const publicView = options?.publicView === true;
  
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
    ...(publicView ? {} : { userId: record.user_id }),
    name: record.name,
    slug: record.slug,
    // For public responses these are intentionally blank; server-side submit resolves from DB by formId/slug.
    ...(publicView ? {} : {
      templateId: record.template_id,
      roleName: record.role_name,
      apiDomain: record.api_domain,
    }),
    // access_token intentionally omitted (P3-04): deprecated field, no longer returned to client
    ...(publicView ? {} : {
      qrStableId: record.qr_stable_id,
      createdAt: record.created_at ? Date.parse(record.created_at as any) : null,
    }),
    landingConfig: landingConfig || undefined,
    ...(publicView ? {} : {
      qrCodeData: record.form_qrcodes?.[0]?.qr_code_data,
      qrStableIdFromDb: record.form_qrcodes?.[0]?.stable_id,
      qrCreatedAt: record.form_qrcodes?.[0]?.created_at,
    })
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
            .select('id,name,slug,landing_config')
          .eq('slug', slug)
          .maybeSingle();
        data = result.data;
        error = result.error;
        
        // If error mentions landing_config or form_qrcodes columns, retry without them
        if (error?.message?.includes('landing_config') || error?.message?.includes('form_qrcodes')) {
          const fallbackResult = await supabaseServer
            .from(table)
              .select('id,name,slug')
            .eq('slug', slug)
            .maybeSingle();
          data = fallbackResult.data;
          error = fallbackResult.error;
        }
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Database query failed' }), { status: 500, headers: JSON_HEADERS });
      }
      if (error) return new Response(JSON.stringify({ error: 'Database error' }), { status: 500, headers: JSON_HEADERS });
      if (!data) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: JSON_HEADERS });
      
      return new Response(JSON.stringify(toCamel(data, { publicView: true })), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store'
        }
      });
    }

    const user = await getUserFromAuthHeader(req);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: PRIVATE_JSON_HEADERS });
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
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      data = result.data;
      error = result.error;
      
      // If error mentions landing_config or form_qrcodes, retry with basic columns only
      if (error?.message?.includes('landing_config') || error?.message?.includes('form_qrcodes')) {
        const fallbackResult = await supabaseServer
          .from(table)
          .select('id,user_id,name,slug,template_id,role_name,api_domain,qr_stable_id,created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        data = fallbackResult.data;
        error = fallbackResult.error;
      }
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Database query failed' }), { status: 500, headers: PRIVATE_JSON_HEADERS });
    }
    
    if (error) return new Response(JSON.stringify({ error: 'Database error' }), { status: 500, headers: PRIVATE_JSON_HEADERS });
    return new Response(JSON.stringify((data || []).map((row: any) => toCamel(row))), { status: 200, headers: PRIVATE_JSON_HEADERS });
  }

  if (req.method === 'POST') {
    const user = await getUserFromAuthHeader(req);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: PRIVATE_JSON_HEADERS });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: PRIVATE_JSON_HEADERS });
    }

    if (!isValidSlug(body.slug)) {
      return new Response(JSON.stringify({ error: 'Invalid slug' }), { status: 400, headers: PRIVATE_JSON_HEADERS });
    }
    
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
          { status: 400, headers: PRIVATE_JSON_HEADERS }
        );
      }
      
      // Validate contact website URL
      if (lc.contact?.website && !validateUrl(lc.contact.website)) {
        return new Response(
          JSON.stringify({ 
            error: 'Invalid website URL', 
            details: getUrlValidationError(lc.contact.website)
          }), 
          { status: 400, headers: PRIVATE_JSON_HEADERS }
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
    
    // P2-03: For new forms, omit id and created_at — the DB generates both.
    // For updates (body.id present), use a separate UPDATE path scoped to user_id.
    const isUpdate = !!body.id;

    if (isUpdate) {
      // UPDATE existing form — id must already exist and belong to this user
      const updateRecord: Record<string, any> = {
        user_id: user.id,
        name: body.name,
        slug: body.slug,
        template_id: body.templateId,
        role_name: body.roleName,
        api_domain: body.apiDomain,
        // P3-04: access_token intentionally not written — deprecated field
      };
      if (landingConfig) {
        updateRecord.landing_config = landingConfig;
      }

      const { data, error } = await supabaseServer
        .from(table)
        .update(updateRecord)
        .eq('id', body.id)
        .eq('user_id', user.id) // Ensures users cannot overwrite each other's forms
        .select()
        .maybeSingle();

      if (error) {
        console.error('[forms] Update error:', error.message);
        return new Response(JSON.stringify({ error: 'Database error' }), { status: 500, headers: PRIVATE_JSON_HEADERS });
      }
      if (!data) {
        return new Response(JSON.stringify({ error: 'Form not found' }), { status: 404, headers: PRIVATE_JSON_HEADERS });
      }
      return new Response(JSON.stringify(toCamel(data)), { status: 200, headers: PRIVATE_JSON_HEADERS });
    }

    // INSERT new form — id and created_at generated by DB (gen_random_uuid() default)
    const insertRecord: Record<string, any> = {
      user_id: user.id,
      name: body.name,
      slug: body.slug,
      template_id: body.templateId,
      role_name: body.roleName,
      api_domain: body.apiDomain,
      // P3-04: access_token intentionally not written — deprecated field
    };
    if (landingConfig) {
      insertRecord.landing_config = landingConfig;
    }

    const { data, error } = await supabaseServer
      .from(table)
      .insert(insertRecord)
      .select()
      .maybeSingle();

    if (error) {
      console.error('[forms] Insert error:', error.message);
      // Constraint violation (e.g. duplicate slug)
        if (error.code === '23505') {
        return new Response(JSON.stringify({ error: 'A form with this slug already exists' }), { status: 409, headers: PRIVATE_JSON_HEADERS });
      }
      return new Response(JSON.stringify({ error: 'Database error' }), { status: 500, headers: PRIVATE_JSON_HEADERS });
    }
    return new Response(JSON.stringify(toCamel(data)), { status: 200, headers: PRIVATE_JSON_HEADERS });
  }

  if (req.method === 'DELETE') {
    const user = await getUserFromAuthHeader(req);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: PRIVATE_JSON_HEADERS });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400, headers: PRIVATE_JSON_HEADERS });

    const { data: deleted, error } = await supabaseServer
      .from(table)
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id')
      .maybeSingle();
    if (error) {
      console.error('[forms] Delete error:', error.message);
      return new Response(JSON.stringify({ error: 'Database error' }), { status: 500, headers: PRIVATE_JSON_HEADERS });
    }
    if (!deleted) {
      return new Response(JSON.stringify({ error: 'Form not found' }), { status: 404, headers: PRIVATE_JSON_HEADERS });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: PRIVATE_JSON_HEADERS });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: JSON_HEADERS });
}
