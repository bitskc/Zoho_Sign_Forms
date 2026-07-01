import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = vi.hoisted(() => ({
  authUser: null as null | { id: string },
  forms: [
    {
      id: 'form-1',
      user_id: 'user-1',
      slug: 'fbmc',
      template_id: 'tpl',
      role_name: 'Employee',
      api_domain: 'https://sign.zoho.com',
    },
    {
      id: 'form-2',
      user_id: 'user-1',
      slug: 'multi',
      template_id: 'tpl-2',
      role_name: 'Customer',
      api_domain: 'https://sign.zoho.com',
      signer_config: {
        notes: 'Please review carefully',
        roles: [
          {
            role: 'Approver',
            action_type: 'APPROVER',
            recipient_name: 'Jane Reviewer',
            recipient_email: 'jane@example.com',
            delivery_mode: 'email',
            is_public: false,
          },
        ],
      },
    },
  ],
  formSlugAliases: [
    { form_id: 'form-1', old_slug: 'old-fbmc' },
  ],
  credentials: null as null | {
    zoho_client_id: string;
    zoho_client_secret: string;
    zoho_refresh_token: string;
    api_domain?: string;
  },
}));

const makeQueryBuilder = (table: string) => {
  const filters: Record<string, unknown> = {};
  const builder: any = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return builder;
    },
    limit: () => builder,
    maybeSingle: vi.fn(async () => {
      if (table === 'forms') {
        const row = state.forms.find(form => Object.entries(filters).every(([key, value]) => (form as any)[key] === value));
        return { data: row || null, error: null };
      }
      if (table === 'user_credentials') {
        return { data: state.credentials, error: null };
      }
      if (table === 'form_slug_aliases') {
        const row = state.formSlugAliases.find(alias => Object.entries(filters).every(([key, value]) => (alias as any)[key] === value));
        return { data: row || null, error: null };
      }
      return { data: null, error: null };
    }),
  };
  return builder;
};

vi.mock('../api/_supabaseServer.js', () => ({
  supabaseServer: {
    auth: {
      // Impl passed directly to vi.fn so it survives vi.restoreAllMocks() in
      // beforeEach (chained mockImplementation() would be reset to undefined).
      getUser: vi.fn(async () => ({
        data: { user: state.authUser },
        error: state.authUser ? null : 'no auth',
      })),
    },
    from: (table: string) => makeQueryBuilder(table),
  },
}));

import handler from '../api/zoho';

describe('/api/zoho', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    state.authUser = null;
    state.credentials = null;
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

  it('rejects unauthenticated template-only submit requests', async () => {
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
    const body = await res.json();
    expect(body.message).toContain('formId and slug');
  });

  it('returns generic public error when public form creds are missing', async () => {
    const req = new Request('http://localhost/api/zoho', {
      method: 'POST',
      body: JSON.stringify({
        formId: 'form-1',
        slug: 'fbmc',
        signer: { name: 'A', email: 'a@test.com' },
      })
    });
    const res = await handler(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Signing unavailable');
    expect(body.message).not.toContain('credentials');
  });

  it('rejects mismatched public formId and slug pairs', async () => {
    const req = new Request('http://localhost/api/zoho', {
      method: 'POST',
      body: JSON.stringify({
        formId: 'form-1',
        slug: 'wrong-slug',
        signer: { name: 'A', email: 'a@test.com' },
      })
    });

    const res = await handler(req);

    expect(res.status).toBe(404);
  });

  it('allows public submit requests from historical slug aliases', async () => {
    state.credentials = {
      zoho_client_id: 'stored-client',
      zoho_client_secret: 'stored-secret',
      zoho_refresh_token: 'stored-refresh',
    };

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'oauth-token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        templates: { actions: [{ role: 'Employee', action_id: 'action-1' }] }
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        requests: { request_id: 'request-1', actions: [{ action_id: 'action-2' }] }
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sign_url: 'https://sign.example/embedded' }), { status: 200 }))
    );

    const req = new Request('http://localhost/api/zoho', {
      method: 'POST',
      body: JSON.stringify({
        formId: 'form-1',
        slug: 'old-fbmc',
        signer: { name: 'A', email: 'a@test.com' },
      })
    });

    const res = await handler(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ requestId: 'request-1', signingUrl: 'https://sign.example/embedded' });
  });

  it('returns a minimal public success response and ignores public client overrides', async () => {
    state.credentials = {
      zoho_client_id: 'stored-client',
      zoho_client_secret: 'stored-secret',
      zoho_refresh_token: 'stored-refresh',
    };

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'oauth-token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        templates: { actions: [{ role: 'Employee', action_id: 'action-1' }] }
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        requests: {
          request_id: 'request-1',
          extra_private_field: 'do-not-return',
          actions: [{ action_id: 'action-2', extra_private_action: 'do-not-return' }]
        }
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sign_url: 'https://sign.example/embedded' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const req = new Request('http://localhost/api/zoho', {
      method: 'POST',
      body: JSON.stringify({
        formId: 'form-1',
        slug: 'fbmc',
        templateId: 'attacker-template',
        roleName: 'Attacker Role',
        apiDomain: 'https://sign.zoho.eu',
        accessToken: 'attacker-token',
        signer: { name: 'A', email: 'a@test.com' },
      })
    });

    const res = await handler(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ requestId: 'request-1', signingUrl: 'https://sign.example/embedded' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://accounts.zoho.com/oauth/v2/token');
    expect(fetchMock.mock.calls[1][0]).toBe('https://sign.zoho.com/api/v1/templates/tpl');
    const createdocumentPayload = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(createdocumentPayload.templates.actions[0].action_id).toBe('action-1');
  });

  it('allows email fallback when public embed token is unavailable', async () => {
    state.credentials = {
      zoho_client_id: 'stored-client',
      zoho_client_secret: 'stored-secret',
      zoho_refresh_token: 'stored-refresh',
    };

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'oauth-token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        templates: { actions: [{ role: 'Employee', action_id: 'action-1' }] }
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        requests: { request_id: 'request-1', actions: [{ action_id: 'action-2' }] }
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'embed failed' }), { status: 500 }))
    );

    const req = new Request('http://localhost/api/zoho', {
      method: 'POST',
      body: JSON.stringify({
        formId: 'form-1',
        slug: 'fbmc',
        signer: { name: 'A', email: 'a@test.com' },
      })
    });

    const res = await handler(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ requestId: 'request-1' });
  });

  it('builds a multi-action payload from template roles and signer_config', async () => {
    state.credentials = {
      zoho_client_id: 'stored-client',
      zoho_client_secret: 'stored-secret',
      zoho_refresh_token: 'stored-refresh',
    };

    const fetchMock = vi.fn()
      // OAuth token refresh
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'oauth-token' }), { status: 200 }))
      // Template lookup: two roles (Customer = public, Approver = configured)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        templates: {
          actions: [
            { role: 'Customer', action_id: 'cust-action', action_type: 'SIGN' },
            { role: 'Approver', action_id: 'appr-action', action_type: 'APPROVER' },
          ],
        }
      }), { status: 200 }))
      // createdocument response
      .mockResolvedValueOnce(new Response(JSON.stringify({
        requests: {
          request_id: 'request-2',
          actions: [
            { role: 'Customer', action_id: 'cust-action' },
            { role: 'Approver', action_id: 'appr-action' },
          ],
        }
      }), { status: 200 }))
      // embed token for the public (Customer) action
      .mockResolvedValueOnce(new Response(JSON.stringify({ sign_url: 'https://sign.example/cust' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    // Public submit (no auth header) — exercises the minimal public response
    // path while still building the multi-action payload from signer_config.
    const req = new Request('http://localhost/api/zoho', {
      method: 'POST',
      body: JSON.stringify({
        formId: 'form-2',
        slug: 'multi',
        signer: { name: 'Bob', email: 'bob@test.com' },
      })
    });

    const res = await handler(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ requestId: 'request-2', signingUrl: 'https://sign.example/cust' });

    const createdocumentPayload = JSON.parse(fetchMock.mock.calls[2][1].body);
    const actions = createdocumentPayload.templates.actions;
    expect(actions).toHaveLength(2);

    const customerAction = actions.find((a: any) => a.role === 'Customer');
    expect(customerAction.recipient_name).toBe('Bob');
    expect(customerAction.recipient_email).toBe('bob@test.com');
    expect(customerAction.is_embedded).toBe(true);

    const approverAction = actions.find((a: any) => a.role === 'Approver');
    expect(approverAction.recipient_name).toBe('Jane Reviewer');
    expect(approverAction.recipient_email).toBe('jane@example.com');
    expect(approverAction.action_type).toBe('APPROVER');
    expect(approverAction.is_embedded).toBe(false);

    expect(createdocumentPayload.templates.notes).toBe('Please review carefully');

    // embedtoken should be requested for the public Customer action only
    expect(fetchMock.mock.calls[3][0]).toContain('cust-action');
  });

  it('returns template roles for an authenticated admin (action=template)', async () => {
    state.authUser = { id: 'user-1' };
    state.credentials = {
      zoho_client_id: 'stored-client',
      zoho_client_secret: 'stored-secret',
      zoho_refresh_token: 'stored-refresh',
    };

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'oauth-token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        templates: {
          actions: [
            { role: 'Customer', action_id: 'cust-action', action_type: 'SIGN' },
            { role: 'Approver', action_id: 'appr-action', action_type: 'APPROVER' },
          ],
        }
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const req = new Request('http://localhost/api/zoho', {
      method: 'POST',
      headers: { Authorization: 'Bearer user-token' },
      body: JSON.stringify({ action: 'template', formId: 'form-2' })
    });

    const res = await handler(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.templateId).toBe('tpl-2');
    expect(body.roleName).toBe('Customer');
    expect(body.roles).toHaveLength(2);
    expect(body.roles.find((r: any) => r.role === 'Customer').isPublic).toBe(true);
    expect(body.roles.find((r: any) => r.role === 'Approver').isPublic).toBe(false);
    expect(body.roles.find((r: any) => r.role === 'Approver').actionType).toBe('APPROVER');
  });

  it('rejects template role fetch without authentication', async () => {
    // Use a fresh formId so the request isn't blocked by the per-form rate
    // limit (5/min) exhausted by earlier form-1 tests in this file.
    const req = new Request('http://localhost/api/zoho', {
      method: 'POST',
      body: JSON.stringify({ action: 'template', formId: 'form-noauth' })
    });
    const res = await handler(req);
    expect(res.status).toBe(401);
  });
});
