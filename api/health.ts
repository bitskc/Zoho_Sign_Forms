import { supabaseServer } from './_supabaseServer.js';

export const config = { runtime: 'edge' };

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

  // Check 1: Supabase Database Connection
  const supabaseStart = Date.now();
  try {
    const { error } = await supabaseServer
      .from('forms')
      .select('id')
      .limit(1);

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
    checks.push({
      service: 'supabase_database',
      status: 'unhealthy',
      message: `Database connection error: ${(error as Error).message}`,
      responseTime,
    });
    overallStatus = 'unhealthy';
  }

  // Check 2: Required Environment Variables
  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE',
    'GEMINI_API_KEY',
    'PUBLIC_URL',
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
