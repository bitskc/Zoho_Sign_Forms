import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  authUser: { id: 'user-1' } as null | { id: string },
  forms: [
    {
      id: 'form-1',
      user_id: 'user-1',
      name: 'Current Form',
      slug: 'current-form',
      template_id: 'tpl',
      role_name: 'Signer 1',
      api_domain: 'https://sign.zoho.com',
      qr_stable_id: 'qr-1',
      created_at: '2026-01-01T00:00:00.000Z',
      landing_config: null,
    },
  ] as any[],
  aliases: [
    { form_id: 'form-1', old_slug: 'old-form' },
  ] as any[],
}));

const makeQueryBuilder = (table: string) => {
  const filters: Record<string, unknown> = {};
  let updatePayload: Record<string, any> | null = null;
  let upsertPayload: Record<string, any> | null = null;

  const matchesFilters = (row: any) => Object.entries(filters).every(([key, value]) => row[key] === value);

  const builder: any = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return builder;
    },
    order: () => builder,
    insert: (payload: Record<string, any>) => {
      if (table === 'forms') {
        const row = { ...payload, id: 'form-new', created_at: '2026-01-02T00:00:00.000Z' };
        state.forms.push(row);
      }
      return builder;
    },
    update: (payload: Record<string, any>) => {
      updatePayload = payload;
      return builder;
    },
    upsert: (payload: Record<string, any>) => {
      upsertPayload = payload;
      const existing = state.aliases.find(alias => alias.old_slug === payload.old_slug);
      if (existing) {
        Object.assign(existing, payload);
      } else {
        state.aliases.push(payload);
      }
      return builder;
    },
    maybeSingle: vi.fn(async () => {
      if (table === 'forms') {
        if (updatePayload) {
          const row = state.forms.find(matchesFilters);
          if (!row) return { data: null, error: null };
          Object.assign(row, updatePayload);
          return { data: row, error: null };
        }

        if (upsertPayload) return { data: upsertPayload, error: null };

        const row = state.forms.find(matchesFilters);
        return { data: row || null, error: null };
      }

      if (table === 'form_slug_aliases') {
        if (upsertPayload) return { data: upsertPayload, error: null };
        const row = state.aliases.find(matchesFilters);
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
      getUser: vi.fn().mockImplementation(async () => ({
        data: { user: state.authUser },
        error: state.authUser ? null : 'no auth',
      })),
    },
    from: (table: string) => makeQueryBuilder(table),
  },
}));

import formsHandler from '../api/forms';

describe('/api/forms slug aliases', () => {
  beforeEach(() => {
    state.authUser = { id: 'user-1' };
    state.forms = [
      {
        id: 'form-1',
        user_id: 'user-1',
        name: 'Current Form',
        slug: 'current-form',
        template_id: 'tpl',
        role_name: 'Signer 1',
        api_domain: 'https://sign.zoho.com',
        qr_stable_id: 'qr-1',
        created_at: '2026-01-01T00:00:00.000Z',
        landing_config: null,
      },
    ];
    state.aliases = [{ form_id: 'form-1', old_slug: 'old-form' }];
  });

  it('loads a public form through a historical slug alias', async () => {
    const res = await formsHandler(new Request('https://www.signflow.ink/api/forms?slug=old-form'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe('form-1');
    expect(body.slug).toBe('current-form');
  });

  it('creates a historical slug alias when a form slug changes', async () => {
    const res = await formsHandler(new Request('https://www.signflow.ink/api/forms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
      body: JSON.stringify({
        id: 'form-1',
        name: 'Current Form',
        slug: 'new-form',
        templateId: 'tpl',
        roleName: 'Signer 1',
        apiDomain: 'https://sign.zoho.com',
      }),
    }));

    expect(res.status).toBe(200);
    expect(state.forms[0].slug).toBe('new-form');
    expect(state.aliases).toContainEqual({ form_id: 'form-1', old_slug: 'current-form' });
  });
});
