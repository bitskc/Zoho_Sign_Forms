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

  const table = 'forms';

  if (req.method === 'GET') {
    const { data, error } = await supabaseServer
      .from(table)
      .select('*')
      .eq('user_id', user.id)
      .order('createdAt', { ascending: false });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    return new Response(JSON.stringify(data || []), { status: 200 });
  }

  if (req.method === 'POST') {
    const body = await req.json();
    const record = {
      id: body.id,
      user_id: user.id,
      name: body.name,
      slug: body.slug,
      templateId: body.templateId,
      roleName: body.roleName,
      apiDomain: body.apiDomain,
      accessToken: body.accessToken,
      // use numeric timestamp to match bigint/int8 columns
      createdAt: body.createdAt || Date.now()
    };

    const { data, error } = await supabaseServer
      .from(table)
      .upsert(record, { onConflict: 'id' })
      .select()
      .maybeSingle();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    return new Response(JSON.stringify(data), { status: 200 });
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
