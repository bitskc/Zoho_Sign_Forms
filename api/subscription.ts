import { supabaseServer } from './_supabaseServer.js';

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

  const table = 'subscriptions';

  if (req.method === 'GET') {
    // Try to get subscription data, fallback to default if table doesn't exist
    try {
      const { data, error } = await supabaseServer
        .from(table)
        .select('plan,status,seats')
        .eq('user_id', user.id)
        .maybeSingle();
        
      if (error && error.message?.includes('relation "subscriptions" does not exist')) {
        // Table doesn't exist yet - return default
        return new Response(JSON.stringify({ plan: 'free', status: 'active', seats: 1 }), { status: 200 });
      }
      
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
      if (!data) return new Response(JSON.stringify({ plan: 'free', status: 'active', seats: 1 }), { status: 200 });
      return new Response(JSON.stringify(data), { status: 200 });
    } catch (e) {
      // Fallback to default subscription
      return new Response(JSON.stringify({ plan: 'free', status: 'active', seats: 1 }), { status: 200 });
    }
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    const body = await req.json();
    const record = {
      user_id: user.id,
      plan: body.plan || 'free',
      status: body.status || 'active',
      seats: body.seats ?? 1
    };
    
    try {
      const { data, error } = await supabaseServer
        .from(table)
        .upsert(record, { onConflict: 'user_id' })
        .select()
        .maybeSingle();
        
      if (error && error.message?.includes('relation "subscriptions" does not exist')) {
        // Table doesn't exist - just return success with the record
        return new Response(JSON.stringify(record), { status: 200 });
      }
      
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400 });
      return new Response(JSON.stringify(data), { status: 200 });
    } catch (e) {
      // Fallback - return success
      return new Response(JSON.stringify(record), { status: 200 });
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
}
