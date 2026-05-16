import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Supabase
const mockSupabaseQuery = vi.fn();
const mockSupabaseServer = {
  from: () => ({
    select: () => ({
      limit: () => ({
        abortSignal: mockSupabaseQuery,
      }),
    }),
  }),
};

vi.mock('../api/_supabaseServer.js', () => ({
  supabaseServer: mockSupabaseServer,
}));

// Import handler after mocks are set up
const handler = (await import('../api/health.ts')).default;

describe('Health Check Endpoint', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock environment variables
    process.env = {
      ...originalEnv,
      SUPABASE_SERVICE_ROLE: 'test-service-role-key',
      VITE_SUPABASE_URL: 'https://test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
      GEMINI_API_KEY: 'test-gemini-key',
      PUBLIC_URL: 'https://test.signflow.ink',
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv;
  });

  it('should return 405 for non-GET requests', async () => {
    const req = new Request('http://localhost/api/health', {
      method: 'POST',
    });

    const response = await handler(req);
    expect(response.status).toBe(405);

    const body = await response.json();
    expect(body).toEqual({ error: 'Method not allowed' });
  });

  it('should return healthy status when all checks pass', async () => {
    // Mock successful database query
    mockSupabaseQuery.mockResolvedValue({
      data: [{ id: 'test-form-id' }],
      error: null,
    });

    const req = new Request('http://localhost/api/health', {
      method: 'GET',
    });

    const response = await handler(req);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('healthy');
    expect(body.checks).toHaveLength(3);
    expect(body.checks[0].service).toBe('supabase_database');
    expect(body.checks[0].status).toBe('healthy');
    expect(body.checks[1].service).toBe('environment_variables');
    expect(body.checks[2].service).toBe('edge_runtime');
    expect(body.checks[2].status).toBe('healthy');
    expect(body.timestamp).toBeDefined();
    expect(body.environment.runtime).toBe('edge');
  });

  it('should return unhealthy status when database check fails', async () => {
    // Mock database error
    mockSupabaseQuery.mockResolvedValue({
      data: null,
      error: { message: 'Connection timeout' },
    });

    const req = new Request('http://localhost/api/health', {
      method: 'GET',
    });

    const response = await handler(req);
    expect(response.status).toBe(503);

    const body = await response.json();
    expect(body.status).toBe('unhealthy');
    expect(body.checks[0].service).toBe('supabase_database');
    expect(body.checks[0].status).toBe('unhealthy');
    expect(body.checks[0].message).toContain('Connection timeout');
  });

  it('should handle database connection exceptions', async () => {
    // Mock database exception
    mockSupabaseQuery.mockRejectedValue(new Error('Network error'));

    const req = new Request('http://localhost/api/health', {
      method: 'GET',
    });

    const response = await handler(req);
    expect(response.status).toBe(503);

    const body = await response.json();
    expect(body.status).toBe('unhealthy');
    expect(body.checks[0].service).toBe('supabase_database');
    expect(body.checks[0].status).toBe('unhealthy');
    expect(body.checks[0].message).toContain('Network error');
  });

  it('should include response times for database checks', async () => {
    vi.useFakeTimers();

    mockSupabaseQuery.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({ data: [{ id: 'test' }], error: null });
          }, 100);
        })
    );

    const req = new Request('http://localhost/api/health', {
      method: 'GET',
    });

    try {
      const responsePromise = handler(req);
      await vi.advanceTimersByTimeAsync(100);
      const response = await responsePromise;
      const body = await response.json();

      expect(body.checks[0].responseTime).toBeGreaterThanOrEqual(100);
      expect(body.checks[0].responseTime).toBeLessThan(200);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should check environment variables', async () => {
    mockSupabaseQuery.mockResolvedValue({
      data: [{ id: 'test' }],
      error: null,
    });

    const req = new Request('http://localhost/api/health', {
      method: 'GET',
    });

    const response = await handler(req);
    const body = await response.json();

    const envCheck = body.checks.find(
      (c: any) => c.service === 'environment_variables'
    );
    expect(envCheck).toBeDefined();
    expect(envCheck.status).toBe('healthy');
  });

  it('should include Cache-Control headers', async () => {
    mockSupabaseQuery.mockResolvedValue({
      data: [{ id: 'test' }],
      error: null,
    });

    const req = new Request('http://localhost/api/health', {
      method: 'GET',
    });

    const response = await handler(req);

    expect(response.headers.get('Cache-Control')).toBe(
      'no-cache, no-store, must-revalidate'
    );
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('X-Health-Status')).toBe('healthy');
  });

  it('should include edge region in response when available', async () => {
    mockSupabaseQuery.mockResolvedValue({
      data: [{ id: 'test' }],
      error: null,
    });

    const req = new Request('http://localhost/api/health', {
      method: 'GET',
      headers: {
        'x-vercel-edge-region': 'iad1',
      },
    });

    const response = await handler(req);
    const body = await response.json();

    expect(body.environment.region).toBe('iad1');
  });

  it('should return valid JSON for all response types', async () => {
    // Test healthy response
    mockSupabaseQuery.mockResolvedValue({
      data: [{ id: 'test' }],
      error: null,
    });

    let req = new Request('http://localhost/api/health', {
      method: 'GET',
    });

    let response = await handler(req);
    let body = await response.json();
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('checks');

    // Test unhealthy response
    mockSupabaseQuery.mockResolvedValue({
      data: null,
      error: { message: 'Error' },
    });

    req = new Request('http://localhost/api/health', {
      method: 'GET',
    });

    response = await handler(req);
    body = await response.json();
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('checks');
  });
});
