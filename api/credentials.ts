import { supabaseServer } from './_supabaseServer';

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
  const user = await getUserFromAuthHeader(req);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const table = 'user_credentials';

  if (req.method === 'GET') {
    const { data, error } = await supabaseServer
      .from(table)
      .select('zoho_client_id,zoho_client_secret,zoho_refresh_token,api_domain')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    if (!data) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    return new Response(JSON.stringify({
      clientId: data.zoho_client_id,
      clientSecret: data.zoho_client_secret,
      refreshToken: data.zoho_refresh_token,
      apiDomain: data.api_domain
    }), { status: 200 });
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    const body = await req.json();
    const record = {
      user_id: user.id,
      zoho_client_id: body.clientId,
      zoho_client_secret: body.clientSecret,
      zoho_refresh_token: body.refreshToken,
      api_domain: body.apiDomain || 'https://sign.zoho.com'
    };

    const { data, error } = await supabaseServer
      .from(table)
      .upsert(record, { onConflict: 'user_id' })
      .select()
      .maybeSingle();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    return new Response(JSON.stringify({
      clientId: data?.zoho_client_id,
      clientSecret: data?.zoho_client_secret,
      refreshToken: data?.zoho_refresh_token,
      apiDomain: data?.api_domain
    }), { status: 200 });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
}
