import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  checkRateLimit, 
  getRateLimitKey, 
  createRateLimitResponse,
  cleanupRateLimitStore,
  RATE_LIMITS 
} from '../api/utils/rateLimiter';

/**
 * Rate Limiter Tests
 * Tests the distributed rate limiting functionality with KV fallback
 */

describe('Rate Limiter', () => {
  describe('getRateLimitKey', () => {
    it('should use user ID when provided', () => {
      const mockReq = new Request('https://example.com', {
        headers: { 'x-forwarded-for': '192.168.1.1' }
      });
      
      const key = getRateLimitKey(mockReq, 'user-123');
      expect(key).toBe('user:user-123');
    });

    it('should use IP from x-forwarded-for when no user ID', () => {
      const mockReq = new Request('https://example.com', {
        headers: { 'x-forwarded-for': '203.0.113.45, 198.51.100.1' }
      });
      
      const key = getRateLimitKey(mockReq);
      expect(key).toBe('ip:203.0.113.45');
    });

    it('should use IP from cf-connecting-ip when available', () => {
      const mockReq = new Request('https://example.com', {
        headers: { 'cf-connecting-ip': '198.51.100.99' }
      });
      
      const key = getRateLimitKey(mockReq);
      expect(key).toBe('ip:198.51.100.99');
    });

    it('should fall back to "unknown" when no IP headers', () => {
      const mockReq = new Request('https://example.com');
      
      const key = getRateLimitKey(mockReq);
      expect(key).toBe('ip:unknown');
    });
  });

  describe('checkRateLimit - In-Memory Mode', () => {
    beforeEach(() => {
      // Clean up before each test
      cleanupRateLimitStore();
    });

    it('should allow requests within limit', () => {
      const config = { windowMs: 60000, maxRequests: 5 };
      
      const result1 = checkRateLimit('test-key-1', config);
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(4);
      
      const result2 = checkRateLimit('test-key-1', config);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(3);
    });

    it('should block requests over limit', () => {
      const config = { windowMs: 60000, maxRequests: 3 };
      
      // Make 3 allowed requests
      checkRateLimit('test-key-2', config);
      checkRateLimit('test-key-2', config);
      const result3 = checkRateLimit('test-key-2', config);
      expect(result3.allowed).toBe(true);
      expect(result3.remaining).toBe(0);
      
      // 4th request should be blocked
      const result4 = checkRateLimit('test-key-2', config);
      expect(result4.allowed).toBe(false);
      expect(result4.retryAfter).toBeGreaterThan(0);
    });

    it('should use sliding window algorithm', async () => {
      const config = { windowMs: 1000, maxRequests: 2 }; // 2 requests per second
      
      const result1 = checkRateLimit('test-key-3', config);
      expect(result1.allowed).toBe(true);
      
      const result2 = checkRateLimit('test-key-3', config);
      expect(result2.allowed).toBe(true);
      
      const result3 = checkRateLimit('test-key-3', config);
      expect(result3.allowed).toBe(false);
      
      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should allow new requests
      const result4 = checkRateLimit('test-key-3', config);
      expect(result4.allowed).toBe(true);
    });

    it('should track different keys independently', () => {
      const config = { windowMs: 60000, maxRequests: 2 };
      
      checkRateLimit('key-a', config);
      checkRateLimit('key-b', config);
      checkRateLimit('key-a', config);
      checkRateLimit('key-b', config);
      
      // Both keys at limit
      const resultA = checkRateLimit('key-a', config);
      const resultB = checkRateLimit('key-b', config);
      
      expect(resultA.allowed).toBe(false);
      expect(resultB.allowed).toBe(false);
    });

    it('should provide accurate remaining count', () => {
      const config = { windowMs: 60000, maxRequests: 5 };
      
      const results = [];
      for (let i = 0; i < 6; i++) {
        results.push(checkRateLimit('test-key-4', config));
      }
      
      expect(results[0].remaining).toBe(4);
      expect(results[1].remaining).toBe(3);
      expect(results[2].remaining).toBe(2);
      expect(results[3].remaining).toBe(1);
      expect(results[4].remaining).toBe(0);
      expect(results[5].remaining).toBe(0); // Still 0 when blocked
    });

    it('should calculate reset time correctly', () => {
      const config = { windowMs: 60000, maxRequests: 1 };
      const before = Date.now();
      
      const result1 = checkRateLimit('test-key-5', config);
      const after = Date.now();
      
      expect(result1.resetTime).toBeGreaterThanOrEqual(before + config.windowMs);
      expect(result1.resetTime).toBeLessThanOrEqual(after + config.windowMs + 100);
    });

    it('should calculate retry-after when blocked', () => {
      const config = { windowMs: 60000, maxRequests: 1 };
      
      checkRateLimit('test-key-6', config); // Use up the limit
      const result = checkRateLimit('test-key-6', config); // Get blocked
      
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.retryAfter).toBeLessThanOrEqual(60);
    });
  });

  describe('Rate Limit Configurations', () => {
    it('should have correct config for Zoho API', () => {
      expect(RATE_LIMITS.ZOHO_API).toEqual({
        windowMs: 60 * 1000,
        maxRequests: 20
      });
    });

    it('should have correct config for credentials', () => {
      expect(RATE_LIMITS.CREDENTIALS).toEqual({
        windowMs: 60 * 1000,
        maxRequests: 10
      });
    });

    it('should have correct config for forms', () => {
      expect(RATE_LIMITS.FORMS).toEqual({
        windowMs: 60 * 1000,
        maxRequests: 30
      });
    });

    it('should have correct config for subscription', () => {
      expect(RATE_LIMITS.SUBSCRIPTION).toEqual({
        windowMs: 5 * 60 * 1000,
        maxRequests: 20
      });
    });

    it('should have correct config for analytics', () => {
      expect(RATE_LIMITS.ANALYTICS).toEqual({
        windowMs: 60 * 1000,
        maxRequests: 10
      });
    });

    it('should enforce different limits for different endpoints', () => {
      // Zoho API: 20 req/min
      for (let i = 0; i < 20; i++) {
        const result = checkRateLimit('zoho-test', RATE_LIMITS.ZOHO_API);
        expect(result.allowed).toBe(true);
      }
      const zohoBlocked = checkRateLimit('zoho-test', RATE_LIMITS.ZOHO_API);
      expect(zohoBlocked.allowed).toBe(false);

      // Forms: 30 req/min (different key)
      for (let i = 0; i < 30; i++) {
        const result = checkRateLimit('forms-test', RATE_LIMITS.FORMS);
        expect(result.allowed).toBe(true);
      }
      const formsBlocked = checkRateLimit('forms-test', RATE_LIMITS.FORMS);
      expect(formsBlocked.allowed).toBe(false);
    });
  });

  describe('createRateLimitResponse', () => {
    it('should create 429 response with correct headers', () => {
      const result = {
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + 60000,
        retryAfter: 60
      };
      
      const response = createRateLimitResponse(result);
      
      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBe('60');
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
      expect(response.headers.get('X-RateLimit-Reset')).toBeTruthy();
    });

    it('should include error message in body', async () => {
      const result = {
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + 60000,
        retryAfter: 45
      };
      
      const response = createRateLimitResponse(result);
      const body = await response.json();
      
      expect(body.error).toBe('Too Many Requests');
      expect(body.message).toContain('Rate limit exceeded');
      expect(body.retryAfter).toBe(45);
    });

    it('should handle missing retryAfter gracefully', () => {
      const result = {
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + 60000
      };
      
      const response = createRateLimitResponse(result);
      
      expect(response.headers.get('Retry-After')).toBe('60');
    });
  });

  describe('cleanupRateLimitStore', () => {
    it('should remove expired entries', async () => {
      const config = { windowMs: 100, maxRequests: 10 };
      
      // Add some requests
      checkRateLimit('cleanup-test-1', config);
      checkRateLimit('cleanup-test-2', config);
      
      // Wait for entries to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Cleanup
      cleanupRateLimitStore();
      
      // New requests should start fresh
      const result = checkRateLimit('cleanup-test-1', config);
      expect(result.remaining).toBe(9); // Should be fresh (10 - 1)
    });

    it('should keep recent entries', () => {
      const config = { windowMs: 60000, maxRequests: 5 };
      
      checkRateLimit('cleanup-test-3', config);
      checkRateLimit('cleanup-test-3', config);
      
      cleanupRateLimitStore();
      
      // Should still have 2 requests counted
      const result = checkRateLimit('cleanup-test-3', config);
      expect(result.remaining).toBe(2); // 5 - 2 previous - 1 current
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero maxRequests', () => {
      const config = { windowMs: 60000, maxRequests: 0 };
      
      const result = checkRateLimit('zero-max', config);
      expect(result.allowed).toBe(false);
    });

    it('should handle very large maxRequests', () => {
      const config = { windowMs: 60000, maxRequests: 1000000 };
      
      for (let i = 0; i < 100; i++) {
        const result = checkRateLimit('large-max', config);
        expect(result.allowed).toBe(true);
      }
    });

    it('should handle very short window', async () => {
      const config = { windowMs: 10, maxRequests: 2 }; // 10ms window
      
      const result1 = checkRateLimit('short-window', config);
      const result2 = checkRateLimit('short-window', config);
      const result3 = checkRateLimit('short-window', config);
      
      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      expect(result3.allowed).toBe(false);
      
      await new Promise(resolve => setTimeout(resolve, 15));
      
      const result4 = checkRateLimit('short-window', config);
      expect(result4.allowed).toBe(true);
    });

    it('should handle very long window', () => {
      const config = { windowMs: 24 * 60 * 60 * 1000, maxRequests: 100 }; // 24 hours
      
      const result = checkRateLimit('long-window', config);
      expect(result.allowed).toBe(true);
      expect(result.resetTime).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);
    });

    it('should handle special characters in keys', () => {
      const config = { windowMs: 60000, maxRequests: 5 };
      
      const specialKeys = [
        'user:test@example.com',
        'ip:192.168.1.1',
        'user:name-with-dash',
        'user:name_with_underscore',
        'user:name.with.dots'
      ];
      
      for (const key of specialKeys) {
        const result = checkRateLimit(key, config);
        expect(result.allowed).toBe(true);
      }
    });

    it('should handle concurrent requests for same key', async () => {
      const config = { windowMs: 60000, maxRequests: 10 };
      
      // Simulate concurrent requests
      const promises = Array.from({ length: 15 }, () => 
        Promise.resolve(checkRateLimit('concurrent-test', config))
      );
      
      const results = await Promise.all(promises);
      
      const allowed = results.filter(r => r.allowed).length;
      const blocked = results.filter(r => !r.allowed).length;
      
      // In memory mode, race conditions may allow slightly more than maxRequests
      // But at least some should be blocked
      expect(allowed).toBeLessThanOrEqual(10);
      expect(blocked).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle typical user session', () => {
      const config = { windowMs: 60000, maxRequests: 20 };
      const userId = 'user-session-test';
      
      // User makes requests at realistic pace
      const results = [];
      for (let i = 0; i < 25; i++) {
        results.push(checkRateLimit(userId, config));
        if (i < 20) {
          expect(results[i].allowed).toBe(true);
        } else {
          expect(results[i].allowed).toBe(false);
        }
      }
      
      // Check that retryAfter is provided for blocked requests
      const blockedRequests = results.filter(r => !r.allowed);
      blockedRequests.forEach(r => {
        expect(r.retryAfter).toBeDefined();
        expect(r.retryAfter).toBeGreaterThan(0);
      });
    });

    it('should handle multiple users independently', () => {
      const config = { windowMs: 60000, maxRequests: 3 };
      
      // User A makes 3 requests
      checkRateLimit('user-a', config);
      checkRateLimit('user-a', config);
      checkRateLimit('user-a', config);
      
      // User B should still have their limit
      const resultB = checkRateLimit('user-b', config);
      expect(resultB.allowed).toBe(true);
      expect(resultB.remaining).toBe(2);
      
      // User A should be blocked
      const resultA = checkRateLimit('user-a', config);
      expect(resultA.allowed).toBe(false);
    });

    it('should handle burst traffic', () => {
      const config = { windowMs: 60000, maxRequests: 10 };
      
      // Burst of 15 requests
      const burst = Array.from({ length: 15 }, () => checkRateLimit('burst-test', config));
      
      const allowedCount = burst.filter(r => r.allowed).length;
      const blockedCount = burst.filter(r => !r.allowed).length;
      
      // Should allow up to maxRequests
      expect(allowedCount).toBeLessThanOrEqual(10);
      expect(blockedCount).toBeGreaterThan(0);
    });

    it('should recover after window expiration', async () => {
      const config = { windowMs: 100, maxRequests: 2 };
      
      // Use up limit
      checkRateLimit('recovery-test', config);
      checkRateLimit('recovery-test', config);
      
      // Should be blocked
      const blocked = checkRateLimit('recovery-test', config);
      expect(blocked.allowed).toBe(false);
      
      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should allow requests again
      const recovered = checkRateLimit('recovery-test', config);
      expect(recovered.allowed).toBe(true);
      expect(recovered.remaining).toBe(1);
    });
  });
});
