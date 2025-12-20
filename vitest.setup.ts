import { vi } from 'vitest';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || 'service-role-key';

// Default fetch mock; individual tests can override implementations
// @ts-ignore
if (!global.fetch) {
  // @ts-ignore
  global.fetch = vi.fn();
}
