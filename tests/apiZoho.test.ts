import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
