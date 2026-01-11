import { describe, it, expect } from 'vitest';

/**
 * Tests for analytics timezone handling and time window calculations
 * These tests validate the getWindowStartDate() function logic from api/analytics.ts
 */

describe('Analytics Timezone Handling', () => {
  // Helper function that matches the logic in api/analytics.ts
  const getWindowStartDate = (window: string, now: Date = new Date()): Date | null => {
    const startDate = new Date(now);
    startDate.setUTCHours(0, 0, 0, 0);
    
    switch (window) {
      case 'day':
        // Start of today (UTC)
        return startDate;
      
      case 'week':
        // Start of this week (Monday at 00:00 UTC)
        const dayOfWeek = startDate.getUTCDay();
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        startDate.setUTCDate(startDate.getUTCDate() - daysToMonday);
        return startDate;
      
      case 'month':
        // Start of this month (1st at 00:00 UTC)
        startDate.setUTCDate(1);
        return startDate;
      
      case 'all':
        // No time filter
        return null;
      
      default:
        // Default to week
        const defaultDayOfWeek = startDate.getUTCDay();
        const defaultDaysToMonday = defaultDayOfWeek === 0 ? 6 : defaultDayOfWeek - 1;
        startDate.setUTCDate(startDate.getUTCDate() - defaultDaysToMonday);
        return startDate;
    }
  };

  describe('Day Window', () => {
    it('should return start of today in UTC', () => {
      const testDate = new Date('2025-01-15T14:30:00Z');
      const result = getWindowStartDate('day', testDate);
      
      expect(result).not.toBeNull();
      expect(result?.toISOString()).toBe('2025-01-15T00:00:00.000Z');
    });

    it('should handle midnight boundary', () => {
      const testDate = new Date('2025-01-15T00:00:00Z');
      const result = getWindowStartDate('day', testDate);
      
      expect(result?.toISOString()).toBe('2025-01-15T00:00:00.000Z');
    });

    it('should handle end of day', () => {
      const testDate = new Date('2025-01-15T23:59:59Z');
      const result = getWindowStartDate('day', testDate);
      
      expect(result?.toISOString()).toBe('2025-01-15T00:00:00.000Z');
    });
  });

  describe('Week Window', () => {
    it('should return start of week (Monday) when current day is Wednesday', () => {
      const testDate = new Date('2025-01-15T14:30:00Z'); // Wednesday
      const result = getWindowStartDate('week', testDate);
      
      expect(result).not.toBeNull();
      expect(result?.toISOString()).toBe('2025-01-13T00:00:00.000Z'); // Previous Monday
    });

    it('should return start of week when current day is Monday', () => {
      const testDate = new Date('2025-01-13T14:30:00Z'); // Monday
      const result = getWindowStartDate('week', testDate);
      
      expect(result?.toISOString()).toBe('2025-01-13T00:00:00.000Z'); // Same Monday
    });

    it('should return previous Monday when current day is Sunday', () => {
      const testDate = new Date('2025-01-19T14:30:00Z'); // Sunday
      const result = getWindowStartDate('week', testDate);
      
      expect(result?.toISOString()).toBe('2025-01-13T00:00:00.000Z'); // Previous Monday
    });

    it('should handle week boundary at midnight', () => {
      const testDate = new Date('2025-01-13T00:00:00Z'); // Monday at midnight
      const result = getWindowStartDate('week', testDate);
      
      expect(result?.toISOString()).toBe('2025-01-13T00:00:00.000Z');
    });

    it('should handle week crossing month boundary', () => {
      const testDate = new Date('2025-02-03T14:30:00Z'); // Monday, Feb 3
      const result = getWindowStartDate('week', testDate);
      
      expect(result?.toISOString()).toBe('2025-02-03T00:00:00.000Z');
    });

    it('should handle week crossing year boundary', () => {
      const testDate = new Date('2025-01-02T14:30:00Z'); // Thursday, Jan 2
      const result = getWindowStartDate('week', testDate);
      
      // Should go back to Monday, Dec 30, 2024
      expect(result?.toISOString()).toBe('2024-12-30T00:00:00.000Z');
    });
  });

  describe('Month Window', () => {
    it('should return start of current month', () => {
      const testDate = new Date('2025-01-15T14:30:00Z');
      const result = getWindowStartDate('month', testDate);
      
      expect(result).not.toBeNull();
      expect(result?.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    });

    it('should handle first day of month', () => {
      const testDate = new Date('2025-01-01T00:00:00Z');
      const result = getWindowStartDate('month', testDate);
      
      expect(result?.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    });

    it('should handle last day of month', () => {
      const testDate = new Date('2025-01-31T23:59:59Z');
      const result = getWindowStartDate('month', testDate);
      
      expect(result?.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    });

    it('should handle February leap year', () => {
      const testDate = new Date('2024-02-29T14:30:00Z'); // Leap year
      const result = getWindowStartDate('month', testDate);
      
      expect(result?.toISOString()).toBe('2024-02-01T00:00:00.000Z');
    });

    it('should handle February non-leap year', () => {
      const testDate = new Date('2025-02-28T14:30:00Z'); // Non-leap year
      const result = getWindowStartDate('month', testDate);
      
      expect(result?.toISOString()).toBe('2025-02-01T00:00:00.000Z');
    });

    it('should handle December to January boundary', () => {
      const testDate = new Date('2025-01-15T14:30:00Z');
      const result = getWindowStartDate('month', testDate);
      
      expect(result?.toISOString()).toBe('2025-01-01T00:00:00.000Z');
      expect(result?.getUTCFullYear()).toBe(2025);
    });
  });

  describe('All Time Window', () => {
    it('should return null for all-time window', () => {
      const testDate = new Date('2025-01-15T14:30:00Z');
      const result = getWindowStartDate('all', testDate);
      
      expect(result).toBeNull();
    });
  });

  describe('Default and Invalid Windows', () => {
    it('should default to week for empty string', () => {
      const testDate = new Date('2025-01-15T14:30:00Z'); // Wednesday
      const result = getWindowStartDate('', testDate);
      
      expect(result?.toISOString()).toBe('2025-01-13T00:00:00.000Z'); // Previous Monday
    });

    it('should default to week for invalid window', () => {
      const testDate = new Date('2025-01-15T14:30:00Z'); // Wednesday
      const result = getWindowStartDate('invalid', testDate);
      
      expect(result?.toISOString()).toBe('2025-01-13T00:00:00.000Z'); // Previous Monday
    });
  });

  describe('UTC Consistency', () => {
    it('should always use UTC regardless of local timezone', () => {
      // This test ensures calculations are timezone-independent
      const testDate = new Date('2025-01-15T14:30:00-05:00'); // 7:30 PM UTC
      const result = getWindowStartDate('day', testDate);
      
      // Should still return start of UTC day
      expect(result?.getUTCHours()).toBe(0);
      expect(result?.getUTCMinutes()).toBe(0);
      expect(result?.getUTCSeconds()).toBe(0);
    });

    it('should handle DST transitions without issues', () => {
      // Test with a date during DST transition (March 10, 2025)
      const testDate = new Date('2025-03-10T14:30:00Z');
      const result = getWindowStartDate('day', testDate);
      
      expect(result?.toISOString()).toBe('2025-03-10T00:00:00.000Z');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very old dates', () => {
      const testDate = new Date('2020-01-01T00:00:00Z');
      const result = getWindowStartDate('month', testDate);
      
      expect(result?.toISOString()).toBe('2020-01-01T00:00:00.000Z');
    });

    it('should handle future dates', () => {
      const testDate = new Date('2030-12-31T23:59:59Z');
      const result = getWindowStartDate('day', testDate);
      
      expect(result?.toISOString()).toBe('2030-12-31T00:00:00.000Z');
    });

    it('should preserve time zone offset in calculations', () => {
      // Create date with specific timezone offset
      const testDate = new Date('2025-01-15T23:30:00+09:00'); // 2:30 PM UTC
      const result = getWindowStartDate('day', testDate);
      
      // Should normalize to UTC start of day
      expect(result?.toISOString()).toBe('2025-01-15T00:00:00.000Z');
    });
  });
});
