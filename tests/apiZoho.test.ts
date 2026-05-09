import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Supabase so DB lookups in the handler don't fail with 404.
// The mock simulates: form found (has a user_id) but no credentials stored.
// This lets the handler reach the "missing credentials → 400" check.
const makeQueryBuilder = (result: any) => {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    limit: () => builder,
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  return builder;
};

vi.mock('../api/_supabaseServer.js', () => ({
  supabaseServer: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: 'no auth' }),
    },
    from: (table: string) => {
      if (table === 'forms') return makeQueryBuilder({ data: { user_id: 'user-1' }, error: null });
      // user_credentials: no creds stored
      return makeQueryBuilder({ data: null, error: null });
    },
  },
}));

import handler from '../api/zoho';

describe('/api/zoho', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 when missing templateId or signer', async () => {
    const req = new Request('http://localhost/api/zoho', {
      method: 'POST',
      body: JSON.stringify({})
    });
    const res = await handler(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when missing creds and accessToken', async () => {
    const req = new Request('http://localhost/api/zoho', {
      method: 'POST',
      body: JSON.stringify({
        templateId: 'tpl',
        signer: { name: 'A', email: 'a@test.com' },
        roleName: 'Employee'
      })
    });
    const res = await handler(req);
    expect(res.status).toBe(400);
  });
});
