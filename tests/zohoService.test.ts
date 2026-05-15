import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { triggerZohoSignTemplate, testZohoConnection } from '../services/zohoService';
import type { FormDefinition } from '../types';

const demoForm: FormDefinition = {
  id: 'form-1',
  name: 'NDA',
  slug: 'nda',
  templateId: 'tpl-123',
  roleName: 'Employee',
  apiDomain: 'https://sign.zoho.com'
};

const signer = { name: 'John Doe', email: 'john@example.com' };

describe('zohoService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends creds payload to /api/zoho', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ requests: { request_id: 'RID', actions: [{ signing_url: 'URL' }] } })
    });
    // @ts-ignore
    global.fetch = mockFetch;

    await triggerZohoSignTemplate(demoForm, signer, false, {
      clientId: 'cid',
      clientSecret: 'csecret',
      refreshToken: 'rtok',
      apiDomain: 'https://sign.zoho.eu',
      userId: 'user-1'
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse((options as any).body);
    expect(body.clientId).toBe('cid');
    expect(body.clientSecret).toBe('csecret');
    expect(body.refreshToken).toBe('rtok');
    expect(body.userId).toBe('user-1');
    expect(body.apiDomain).toBe('https://sign.zoho.eu');
  });

  it('returns success for testZohoConnection passthrough', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ requests: { request_id: 'RID', actions: [{ signing_url: 'URL' }] } })
    });
    // @ts-ignore
    global.fetch = mockFetch;

    const res = await testZohoConnection(demoForm, {
      clientId: 'cid',
      clientSecret: 'csecret',
      refreshToken: 'rtok',
      apiDomain: 'https://sign.zoho.com',
      userId: 'user-1'
    });

    expect(res.success).toBe(true);
    expect(res.signingUrl).toBe('URL');
  });

  it('parses minimal public submit responses', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ requestId: 'RID', signingUrl: 'URL' })
    });
    // @ts-ignore
    global.fetch = mockFetch;

    const res = await triggerZohoSignTemplate(demoForm, signer);

    expect(res).toEqual({ success: true, requestId: 'RID', signingUrl: 'URL' });
  });
});
