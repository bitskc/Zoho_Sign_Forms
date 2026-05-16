import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({
  forms: [
    { id: 'form-current', slug: 'current-form', qr_stable_id: 'qr-current' },
    { id: 'form-legacy', slug: 'legacy-form', qr_stable_id: null },
  ],
  formQrcodes: [
    { form_id: 'form-legacy', stable_id: 'qr-legacy' },
  ],
  tableErrors: {} as Record<string, { message: string } | null>,
}));

const makeQueryBuilder = (table: string) => {
  const filters: Record<string, unknown> = {};
  const builder: any = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return builder;
    },
    maybeSingle: vi.fn(async () => {
      if (state.tableErrors[table]) {
        return { data: null, error: state.tableErrors[table] };
      }

      if (table === 'forms') {
        const row = state.forms.find(form => Object.entries(filters).every(([key, value]) => (form as any)[key] === value));
        return { data: row || null, error: null };
      }

      if (table === 'form_qrcodes') {
        const row = state.formQrcodes.find(qr => Object.entries(filters).every(([key, value]) => (qr as any)[key] === value));
        return { data: row || null, error: null };
      }

      return { data: null, error: null };
    }),
  };
  return builder;
};

vi.mock('../api/_supabaseServer.js', () => ({
  supabaseServer: {
    from: (table: string) => makeQueryBuilder(table),
  },
}));

import handler from '../api/qr-redirect';

describe('/api/qr-redirect', () => {
  beforeEach(() => {
    process.env.PUBLIC_URL = 'https://www.signflow.ink';
    state.tableErrors = {};
  });

  it('redirects QR codes stored on the form record', async () => {
    const res = await handler(new Request('https://www.signflow.ink/qr/qr-current', {
      headers: { 'x-forwarded-for': '192.0.2.1' },
    }));

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://www.signflow.ink/current-form');
  });

  it('redirects existing QR codes stored only in form_qrcodes', async () => {
    const res = await handler(new Request('https://www.signflow.ink/qr/qr-legacy', {
      headers: { 'x-forwarded-for': '192.0.2.2' },
    }));

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://www.signflow.ink/legacy-form');
  });

  it('returns 404 for unknown QR codes', async () => {
    const res = await handler(new Request('https://www.signflow.ink/qr/qr-missing', {
      headers: { 'x-forwarded-for': '192.0.2.3' },
    }));

    expect(res.status).toBe(404);
  });

  it('returns 500 when the legacy QR lookup fails', async () => {
    state.tableErrors.form_qrcodes = { message: 'database unavailable' };

    const res = await handler(new Request('https://www.signflow.ink/qr/qr-legacy', {
      headers: { 'x-forwarded-for': '192.0.2.4' },
    }));

    expect(res.status).toBe(500);
  });

  it('returns 500 when the primary QR lookup fails', async () => {
    state.tableErrors.forms = { message: 'database unavailable' };

    const res = await handler(new Request('https://www.signflow.ink/qr/qr-current', {
      headers: { 'x-forwarded-for': '192.0.2.5' },
    }));

    expect(res.status).toBe(500);
  });
});
