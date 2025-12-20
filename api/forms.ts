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

function toCamel(record: any) {
  if (!record) return record;
  return {
    id: record.id,
    user_id: record.user_id,
    name: record.name,
    slug: record.slug,
    templateId: record.template_id,
    roleName: record.role_name,
    apiDomain: record.api_domain,
    accessToken: record.access_token,
    createdAt: record.created_at
  };
}

export default async function handler(req: Request) {
  const user = await getUserFromAuthHeader(req);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const table = 'forms';

  if (req.method === 'GET') {
    const { data, error } = await supabaseServer
      .from(table)
      .select('id,user_id,name,slug,template_id,role_name,api_domain,access_token,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    return new Response(JSON.stringify((data || []).map(toCamel)), { status: 200 });
  }

  if (req.method === 'POST') {
    const body = await req.json();
    const record = {
      id: body.id,
      user_id: user.id,
      name: body.name,
      slug: body.slug,
      template_id: body.templateId,
      role_name: body.roleName,
      api_domain: body.apiDomain,
      access_token: body.accessToken,
      // use numeric timestamp to match bigint/int8 columns
      created_at: body.createdAt || Date.now()
    };

    const { data, error } = await supabaseServer
      .from(table)
      .upsert(record, { onConflict: 'id' })
      .select()
      .maybeSingle();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    return new Response(JSON.stringify(toCamel(data)), { status: 200 });
  }

  if (req.method === 'DELETE') {
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
