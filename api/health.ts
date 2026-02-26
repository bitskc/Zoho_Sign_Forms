import { supabaseServer } from './_supabaseServer.js';

export const config = { runtime: 'edge' };

const DB_QUERY_TIMEOUT_MS = 5000;

interface HealthCheck {
  service: string;
  status: 'healthy' | 'unhealthy';
  message?: string;
  responseTime?: number;
}

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: HealthCheck[];
  environment: {
    runtime: string;
    region?: string;
  };
}

export default async function handler(req: Request): Promise<Response> {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const checks: HealthCheck[] = [];
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  // Check 1: Required Environment Variables (run first so DB check is skipped when creds are missing)
  // Critical env vars — health check fails if these are missing
  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE',
  ];

  // Optional env vars — warn if missing but don't fail health check
  const optionalEnvVars = [
    'PUBLIC_URL', // Falls back to https://www.signflow.ink if not set
    'GEMINI_API_KEY', // Only used in client-side Vite build, not API endpoints
  ];

  const missingEnvVars = requiredEnvVars.filter(
    (varName) => !process.env[varName]
  );

  if (missingEnvVars.length > 0) {
    checks.push({
      service: 'environment_variables',
      status: 'unhealthy',
      message: `Missing required environment variables: ${missingEnvVars.join(', ')}`,
    });
    overallStatus = 'unhealthy';
  } else {
    checks.push({
      service: 'environment_variables',
      status: 'healthy',
      message: 'All required environment variables are set',
    });
  }

  // Check 2: Supabase Database Connection
  // Only attempt if required env vars are present (avoids misleading "DB error" when creds missing)
  const dbEnvPresent = !missingEnvVars.includes('SUPABASE_URL') && !missingEnvVars.includes('SUPABASE_SERVICE_ROLE');

  if (dbEnvPresent) {
    const supabaseStart = Date.now();
    try {
      // Use AbortController to enforce a bounded timeout since .timeout() is not part of the Supabase JS client API
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DB_QUERY_TIMEOUT_MS);

      const { error } = await supabaseServer
        .from('forms')
        .select('id')
        .limit(1)
        .abortSignal(controller.signal);

      clearTimeout(timeoutId);
      const responseTime = Date.now() - supabaseStart;

      if (error) {
        checks.push({
          service: 'supabase_database',
          status: 'unhealthy',
          message: `Database query failed: ${error.message}`,
          responseTime,
        });
        overallStatus = 'unhealthy';
      } else {
        checks.push({
          service: 'supabase_database',
          status: 'healthy',
          message: 'Database connection successful',
          responseTime,
        });
      }
    } catch (error) {
      const responseTime = Date.now() - supabaseStart;
      const isTimeout = (error as Error).name === 'AbortError';
      checks.push({
        service: 'supabase_database',
        status: 'unhealthy',
        message: isTimeout
          ? `Database query timed out after ${DB_QUERY_TIMEOUT_MS}ms`
          : `Database connection error: ${(error as Error).message}`,
        responseTime,
      });
      overallStatus = 'unhealthy';
    }
  } else {
    checks.push({
      service: 'supabase_database',
      status: 'unhealthy',
      message: 'Skipped: SUPABASE_URL or SUPABASE_SERVICE_ROLE is missing',
    });
    overallStatus = 'unhealthy';
  }

  // Check 3: Edge Runtime Status
  checks.push({
    service: 'edge_runtime',
    status: 'healthy',
    message: 'Edge function is running',
  });

  // Determine overall status
  const unhealthyCount = checks.filter((c) => c.status === 'unhealthy').length;
  if (unhealthyCount > 0) {
    overallStatus = 'unhealthy';
  }

  const response: HealthResponse = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    checks,
    environment: {
      runtime: 'edge',
      region: req.headers.get('x-vercel-edge-region') || undefined,
    },
  };

  // Return appropriate HTTP status code
  const httpStatus = overallStatus === 'healthy' ? 200 : 503;

  return new Response(JSON.stringify(response, null, 2), {
    status: httpStatus,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Health-Status': overallStatus,
    },
  });
}
