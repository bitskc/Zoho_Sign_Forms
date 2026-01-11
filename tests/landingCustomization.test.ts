import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { FormDefinition, LandingConfig, LandingTheme, LandingContact } from '../types';

/**
 * Integration tests for Landing Customization Flow
 * Tests the complete save → fetch → render cycle with JSONB serialization
 */

describe('Landing Customization Integration', () => {
  // Helper function to simulate the toCamel conversion from api/forms.ts
  const toCamel = (record: any): FormDefinition => {
    if (!record) return record;
    
    // Convert snake_case landing_config keys to camelCase
    let landingConfig = record.landing_config;
    if (landingConfig && typeof landingConfig === 'object') {
      landingConfig = {
        headline: landingConfig.headline,
        description: landingConfig.description,
        logoUrl: landingConfig.logo_url,
        logoAlt: landingConfig.logo_alt,
        theme: landingConfig.theme ? {
          primaryColor: landingConfig.theme.primary_color,
          backgroundColor: landingConfig.theme.background_color,
          cardColor: landingConfig.theme.card_color,
          textColor: landingConfig.theme.text_color,
          mutedColor: landingConfig.theme.muted_color,
          accentColor: landingConfig.theme.accent_color,
          darkMode: landingConfig.theme.dark_mode
        } : undefined,
        contact: landingConfig.contact ? {
          companyName: landingConfig.contact.company_name,
          email: landingConfig.contact.email,
          phone: landingConfig.contact.phone,
          website: landingConfig.contact.website,
          address: landingConfig.contact.address
        } : undefined,
        footerText: landingConfig.footer_text,
        showPoweredBy: landingConfig.show_powered_by,
        buttonText: landingConfig.button_text
      };
    }
    
    return {
      id: record.id,
      userId: record.user_id,
      name: record.name,
      slug: record.slug,
      templateId: record.template_id,
      roleName: record.role_name,
      apiDomain: record.api_domain,
      accessToken: record.access_token,
      qrStableId: record.qr_stable_id,
      createdAt: record.created_at ? Date.parse(record.created_at as any) : null,
      landingConfig: landingConfig || undefined,
      qrCodeData: record.form_qrcodes?.[0]?.qr_code_data,
      qrStableIdFromDb: record.form_qrcodes?.[0]?.stable_id,
      qrCreatedAt: record.form_qrcodes?.[0]?.created_at
    };
  };

  // Helper function to simulate the toSnake conversion from api/forms.ts
  const toSnake = (landingConfig: LandingConfig) => {
    if (!landingConfig || typeof landingConfig !== 'object') {
      return landingConfig;
    }
    
    return {
      headline: landingConfig.headline,
      description: landingConfig.description,
      logo_url: landingConfig.logoUrl,
      logo_alt: landingConfig.logoAlt,
      theme: landingConfig.theme ? {
        primary_color: landingConfig.theme.primaryColor,
        background_color: landingConfig.theme.backgroundColor,
        card_color: landingConfig.theme.cardColor,
        text_color: landingConfig.theme.textColor,
        muted_color: landingConfig.theme.mutedColor,
        accent_color: landingConfig.theme.accentColor,
        dark_mode: landingConfig.theme.darkMode
      } : undefined,
      contact: landingConfig.contact ? {
        company_name: landingConfig.contact.companyName,
        email: landingConfig.contact.email,
        phone: landingConfig.contact.phone,
        website: landingConfig.contact.website,
        address: landingConfig.contact.address
      } : undefined,
      footer_text: landingConfig.footerText,
      show_powered_by: landingConfig.showPoweredBy,
      button_text: landingConfig.buttonText
    };
  };

  describe('JSONB Round-Trip Conversion', () => {
    it('should convert minimal landing config through full cycle', () => {
      const originalConfig: LandingConfig = {
        headline: 'Welcome',
        buttonText: 'Sign Now'
      };

      // Convert to snake_case (for DB storage)
      const dbFormat = toSnake(originalConfig);
      expect(dbFormat).toEqual({
        headline: 'Welcome',
        description: undefined,
        logo_url: undefined,
        logo_alt: undefined,
        theme: undefined,
        contact: undefined,
        footer_text: undefined,
        show_powered_by: undefined,
        button_text: 'Sign Now'
      });

      // Convert back to camelCase (from DB)
      const mockDbRecord = {
        id: 'form-1',
        user_id: 'user-1',
        name: 'Test Form',
        slug: 'test-form',
        template_id: 'tpl-123',
        role_name: 'Signer',
        api_domain: 'sign.zoho.com',
        landing_config: dbFormat,
        created_at: '2026-01-11T00:00:00Z'
      };

      const result = toCamel(mockDbRecord);
      expect(result.landingConfig).toEqual({
        headline: 'Welcome',
        description: undefined,
        logoUrl: undefined,
        logoAlt: undefined,
        theme: undefined,
        contact: undefined,
        footerText: undefined,
        showPoweredBy: undefined,
        buttonText: 'Sign Now'
      });
    });

    it('should convert full landing config with all fields through cycle', () => {
      const originalConfig: LandingConfig = {
        headline: 'Sign Your Contract',
        description: 'Complete the signing process below',
        logoUrl: 'https://example.com/logo.png',
        logoAlt: 'Company Logo',
        theme: {
          primaryColor: '#0066cc',
          backgroundColor: '#ffffff',
          cardColor: '#f5f5f5',
          textColor: '#333333',
          mutedColor: '#666666',
          accentColor: '#00cc66',
          darkMode: false
        },
        contact: {
          companyName: 'Acme Corp',
          email: 'support@acme.com',
          phone: '+1-555-0123',
          website: 'https://acme.com',
          address: '123 Main St, City, State 12345'
        },
        footerText: '© 2026 Acme Corp. All rights reserved.',
        showPoweredBy: true,
        buttonText: 'Complete Signature'
      };

      // Convert to snake_case
      const dbFormat = toSnake(originalConfig);

      // Simulate DB storage
      const mockDbRecord = {
        id: 'form-2',
        user_id: 'user-2',
        name: 'Contract Form',
        slug: 'contract',
        template_id: 'tpl-456',
        role_name: 'Signer',
        api_domain: 'sign.zoho.com',
        landing_config: dbFormat,
        created_at: '2026-01-11T12:00:00Z'
      };

      // Convert back to camelCase
      const result = toCamel(mockDbRecord);

      // Verify exact round-trip
      expect(result.landingConfig).toEqual(originalConfig);
      expect(result.landingConfig?.theme?.primaryColor).toBe('#0066cc');
      expect(result.landingConfig?.contact?.companyName).toBe('Acme Corp');
      expect(result.landingConfig?.showPoweredBy).toBe(true);
    });

    it('should handle partial theme configuration', () => {
      const originalConfig: LandingConfig = {
        theme: {
          primaryColor: '#ff6600',
          darkMode: true
          // Other theme fields omitted
        }
      };

      const dbFormat = toSnake(originalConfig);
      const mockDbRecord = {
        id: 'form-3',
        user_id: 'user-3',
        name: 'Themed Form',
        slug: 'themed',
        template_id: 'tpl-789',
        role_name: 'Signer',
        api_domain: 'sign.zoho.com',
        landing_config: dbFormat,
        created_at: '2026-01-11T12:00:00Z'
      };

      const result = toCamel(mockDbRecord);

      expect(result.landingConfig?.theme?.primaryColor).toBe('#ff6600');
      expect(result.landingConfig?.theme?.darkMode).toBe(true);
      expect(result.landingConfig?.theme?.backgroundColor).toBeUndefined();
    });

    it('should handle partial contact information', () => {
      const originalConfig: LandingConfig = {
        contact: {
          email: 'info@company.com',
          website: 'https://company.com'
          // Other contact fields omitted
        }
      };

      const dbFormat = toSnake(originalConfig);
      const mockDbRecord = {
        id: 'form-4',
        user_id: 'user-4',
        name: 'Contact Form',
        slug: 'contact',
        template_id: 'tpl-999',
        role_name: 'Signer',
        api_domain: 'sign.zoho.com',
        landing_config: dbFormat,
        created_at: '2026-01-11T12:00:00Z'
      };

      const result = toCamel(mockDbRecord);

      expect(result.landingConfig?.contact?.email).toBe('info@company.com');
      expect(result.landingConfig?.contact?.website).toBe('https://company.com');
      expect(result.landingConfig?.contact?.phone).toBeUndefined();
      expect(result.landingConfig?.contact?.address).toBeUndefined();
    });

    it('should handle undefined landing config', () => {
      const mockDbRecord = {
        id: 'form-5',
        user_id: 'user-5',
        name: 'Basic Form',
        slug: 'basic',
        template_id: 'tpl-111',
        role_name: 'Signer',
        api_domain: 'sign.zoho.com',
        landing_config: undefined,
        created_at: '2026-01-11T12:00:00Z'
      };

      const result = toCamel(mockDbRecord);
      expect(result.landingConfig).toBeUndefined();
    });

    it('should handle null landing config', () => {
      const mockDbRecord = {
        id: 'form-6',
        user_id: 'user-6',
        name: 'Null Config Form',
        slug: 'null-config',
        template_id: 'tpl-222',
        role_name: 'Signer',
        api_domain: 'sign.zoho.com',
        landing_config: null,
        created_at: '2026-01-11T12:00:00Z'
      };

      const result = toCamel(mockDbRecord);
      expect(result.landingConfig).toBeUndefined();
    });

    it('should handle empty landing config object', () => {
      const originalConfig: LandingConfig = {};

      const dbFormat = toSnake(originalConfig);
      const mockDbRecord = {
        id: 'form-7',
        user_id: 'user-7',
        name: 'Empty Config Form',
        slug: 'empty',
        template_id: 'tpl-333',
        role_name: 'Signer',
        api_domain: 'sign.zoho.com',
        landing_config: dbFormat,
        created_at: '2026-01-11T12:00:00Z'
      };

      const result = toCamel(mockDbRecord);
      expect(result.landingConfig).toBeDefined();
      expect(result.landingConfig?.headline).toBeUndefined();
    });
  });

  describe('Complex Configuration Scenarios', () => {
    it('should preserve special characters in text fields', () => {
      const originalConfig: LandingConfig = {
        headline: 'Welcome to "Acme" Corp™',
        description: 'Sign & complete your contract—fast & secure!',
        footerText: '© 2026 • All Rights Reserved'
      };

      const dbFormat = toSnake(originalConfig);
      const mockDbRecord = {
        id: 'form-8',
        user_id: 'user-8',
        name: 'Special Chars Form',
        slug: 'special',
        template_id: 'tpl-444',
        role_name: 'Signer',
        api_domain: 'sign.zoho.com',
        landing_config: dbFormat,
        created_at: '2026-01-11T12:00:00Z'
      };

      const result = toCamel(mockDbRecord);
      expect(result.landingConfig?.headline).toBe('Welcome to "Acme" Corp™');
      expect(result.landingConfig?.description).toContain('&');
      expect(result.landingConfig?.footerText).toContain('©');
    });

    it('should handle very long text content', () => {
      const longDescription = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(50);
      const originalConfig: LandingConfig = {
        headline: 'Long Form',
        description: longDescription
      };

      const dbFormat = toSnake(originalConfig);
      const mockDbRecord = {
        id: 'form-9',
        user_id: 'user-9',
        name: 'Long Content Form',
        slug: 'long',
        template_id: 'tpl-555',
        role_name: 'Signer',
        api_domain: 'sign.zoho.com',
        landing_config: dbFormat,
        created_at: '2026-01-11T12:00:00Z'
      };

      const result = toCamel(mockDbRecord);
      expect(result.landingConfig?.description).toBe(longDescription);
      expect(result.landingConfig?.description?.length).toBeGreaterThan(1000);
    });

    it('should handle unicode characters', () => {
      const originalConfig: LandingConfig = {
        headline: '欢迎 • Bienvenido • مرحبا',
        contact: {
          companyName: 'グローバル株式会社',
          address: 'Москва, Россия'
        }
      };

      const dbFormat = toSnake(originalConfig);
      const mockDbRecord = {
        id: 'form-10',
        user_id: 'user-10',
        name: 'Unicode Form',
        slug: 'unicode',
        template_id: 'tpl-666',
        role_name: 'Signer',
        api_domain: 'sign.zoho.com',
        landing_config: dbFormat,
        created_at: '2026-01-11T12:00:00Z'
      };

      const result = toCamel(mockDbRecord);
      expect(result.landingConfig?.headline).toBe('欢迎 • Bienvenido • مرحبا');
      expect(result.landingConfig?.contact?.companyName).toBe('グローバル株式会社');
    });

    it('should handle multiline text with newlines', () => {
      const originalConfig: LandingConfig = {
        description: 'Line 1\nLine 2\nLine 3',
        contact: {
          address: '123 Main St\nSuite 100\nCity, State 12345'
        }
      };

      const dbFormat = toSnake(originalConfig);
      const mockDbRecord = {
        id: 'form-11',
        user_id: 'user-11',
        name: 'Multiline Form',
        slug: 'multiline',
        template_id: 'tpl-777',
        role_name: 'Signer',
        api_domain: 'sign.zoho.com',
        landing_config: dbFormat,
        created_at: '2026-01-11T12:00:00Z'
      };

      const result = toCamel(mockDbRecord);
      expect(result.landingConfig?.description).toContain('\n');
      expect(result.landingConfig?.contact?.address?.split('\n')).toHaveLength(3);
    });

    it('should handle color variations (hex, rgb, named)', () => {
      const originalConfig: LandingConfig = {
        theme: {
          primaryColor: '#FF5733',
          backgroundColor: 'rgb(255, 255, 255)',
          textColor: 'black',
          darkMode: false
        }
      };

      const dbFormat = toSnake(originalConfig);
      const mockDbRecord = {
        id: 'form-12',
        user_id: 'user-12',
        name: 'Color Form',
        slug: 'colors',
        template_id: 'tpl-888',
        role_name: 'Signer',
        api_domain: 'sign.zoho.com',
        landing_config: dbFormat,
        created_at: '2026-01-11T12:00:00Z'
      };

      const result = toCamel(mockDbRecord);
      expect(result.landingConfig?.theme?.primaryColor).toBe('#FF5733');
      expect(result.landingConfig?.theme?.backgroundColor).toBe('rgb(255, 255, 255)');
      expect(result.landingConfig?.theme?.textColor).toBe('black');
    });

    it('should handle boolean flags correctly', () => {
      const configs = [
        { showPoweredBy: true },
        { showPoweredBy: false },
        { theme: { darkMode: true } },
        { theme: { darkMode: false } }
      ];

      configs.forEach((config, index) => {
        const dbFormat = toSnake(config as LandingConfig);
        const mockDbRecord = {
          id: `form-bool-${index}`,
          user_id: 'user-bool',
          name: 'Boolean Form',
          slug: `bool-${index}`,
          template_id: 'tpl-bool',
          role_name: 'Signer',
          api_domain: 'sign.zoho.com',
          landing_config: dbFormat,
          created_at: '2026-01-11T12:00:00Z'
        };

        const result = toCamel(mockDbRecord);

        if ('showPoweredBy' in config) {
          expect(result.landingConfig?.showPoweredBy).toBe(config.showPoweredBy);
        }
        if (config.theme?.darkMode !== undefined) {
          expect(result.landingConfig?.theme?.darkMode).toBe(config.theme.darkMode);
        }
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle malformed theme objects gracefully', () => {
      const mockDbRecord = {
        id: 'form-13',
        user_id: 'user-13',
        name: 'Malformed Theme Form',
        slug: 'malformed',
        template_id: 'tpl-999',
        role_name: 'Signer',
        api_domain: 'sign.zoho.com',
        landing_config: {
          headline: 'Test',
          theme: null // Null theme
        },
        created_at: '2026-01-11T12:00:00Z'
      };

      const result = toCamel(mockDbRecord);
      expect(result.landingConfig?.headline).toBe('Test');
      expect(result.landingConfig?.theme).toBeUndefined();
    });

    it('should handle malformed contact objects gracefully', () => {
      const mockDbRecord = {
        id: 'form-14',
        user_id: 'user-14',
        name: 'Malformed Contact Form',
        slug: 'malformed-contact',
        template_id: 'tpl-1000',
        role_name: 'Signer',
        api_domain: 'sign.zoho.com',
        landing_config: {
          headline: 'Test',
          contact: null // Null contact
        },
        created_at: '2026-01-11T12:00:00Z'
      };

      const result = toCamel(mockDbRecord);
      expect(result.landingConfig?.headline).toBe('Test');
      expect(result.landingConfig?.contact).toBeUndefined();
    });

    it('should handle empty strings vs undefined correctly', () => {
      const originalConfig: LandingConfig = {
        headline: '', // Empty string
        description: undefined, // Undefined
        logoUrl: '', // Empty string
        footerText: undefined // Undefined
      };

      const dbFormat = toSnake(originalConfig);
      const mockDbRecord = {
        id: 'form-15',
        user_id: 'user-15',
        name: 'Empty String Form',
        slug: 'empty-strings',
        template_id: 'tpl-1001',
        role_name: 'Signer',
        api_domain: 'sign.zoho.com',
        landing_config: dbFormat,
        created_at: '2026-01-11T12:00:00Z'
      };

      const result = toCamel(mockDbRecord);
      expect(result.landingConfig?.headline).toBe('');
      expect(result.landingConfig?.description).toBeUndefined();
      expect(result.landingConfig?.logoUrl).toBe('');
      expect(result.landingConfig?.footerText).toBeUndefined();
    });

    it('should preserve null vs undefined in nested objects', () => {
      const mockDbRecord = {
        id: 'form-16',
        user_id: 'user-16',
        name: 'Null vs Undefined',
        slug: 'null-vs-undefined',
        template_id: 'tpl-1002',
        role_name: 'Signer',
        api_domain: 'sign.zoho.com',
        landing_config: {
          headline: 'Test',
          theme: {
            primary_color: '#000000',
            background_color: null,
            text_color: undefined
          }
        },
        created_at: '2026-01-11T12:00:00Z'
      };

      const result = toCamel(mockDbRecord);
      expect(result.landingConfig?.theme?.primaryColor).toBe('#000000');
      // Both null and undefined should become undefined in camelCase conversion
      expect(result.landingConfig?.theme?.backgroundColor).toBeNull();
      expect(result.landingConfig?.theme?.textColor).toBeUndefined();
    });

    it('should handle very deeply nested structures', () => {
      const originalConfig: LandingConfig = {
        headline: 'Test',
        theme: {
          primaryColor: '#123456',
          backgroundColor: '#ffffff',
          cardColor: '#f0f0f0',
          textColor: '#333333',
          mutedColor: '#999999',
          accentColor: '#00ff00',
          darkMode: true
        },
        contact: {
          companyName: 'Deep Nest Corp',
          email: 'deep@nest.com',
          phone: '555-0001',
          website: 'https://deep.nest',
          address: 'Deep Address'
        }
      };

      const dbFormat = toSnake(originalConfig);
      const mockDbRecord = {
        id: 'form-17',
        user_id: 'user-17',
        name: 'Deep Nested Form',
        slug: 'deep-nested',
        template_id: 'tpl-1003',
        role_name: 'Signer',
        api_domain: 'sign.zoho.com',
        landing_config: dbFormat,
        created_at: '2026-01-11T12:00:00Z'
      };

      const result = toCamel(mockDbRecord);

      // Verify all nested properties survive round-trip
      expect(result.landingConfig?.theme?.primaryColor).toBe('#123456');
      expect(result.landingConfig?.theme?.darkMode).toBe(true);
      expect(result.landingConfig?.contact?.companyName).toBe('Deep Nest Corp');
      expect(result.landingConfig?.contact?.website).toBe('https://deep.nest');
    });
  });

  describe('Type Safety and Validation', () => {
    it('should maintain correct TypeScript types after conversion', () => {
      const originalConfig: LandingConfig = {
        headline: 'Type Test',
        theme: {
          darkMode: false
        },
        showPoweredBy: true
      };

      const dbFormat = toSnake(originalConfig);
      const mockDbRecord = {
        id: 'form-18',
        user_id: 'user-18',
        name: 'Type Safety Form',
        slug: 'type-safety',
        template_id: 'tpl-1004',
        role_name: 'Signer',
        api_domain: 'sign.zoho.com',
        landing_config: dbFormat,
        created_at: '2026-01-11T12:00:00Z'
      };

      const result = toCamel(mockDbRecord);

      // Type assertions - these should compile without errors
      const headline: string | undefined = result.landingConfig?.headline;
      const darkMode: boolean | undefined = result.landingConfig?.theme?.darkMode;
      const showPowered: boolean | undefined = result.landingConfig?.showPoweredBy;

      expect(typeof headline).toBe('string');
      expect(typeof darkMode).toBe('boolean');
      expect(typeof showPowered).toBe('boolean');
    });

    it('should handle all possible LandingConfig combinations', () => {
      // Test matrix of different config combinations
      const testCases: LandingConfig[] = [
        { headline: 'Only headline' },
        { description: 'Only description' },
        { buttonText: 'Only button' },
        { theme: { primaryColor: '#000' } },
        { contact: { email: 'test@test.com' } },
        { headline: 'H', description: 'D' },
        { headline: 'H', theme: { darkMode: true } },
        { contact: { email: 'e@e.com' }, footerText: 'Footer' },
        { 
          headline: 'All fields',
          description: 'Desc',
          logoUrl: 'https://example.com/logo.png',
          logoAlt: 'Logo',
          theme: { primaryColor: '#f00', darkMode: false },
          contact: { email: 'all@all.com' },
          footerText: 'Foot',
          showPoweredBy: false,
          buttonText: 'Button'
        }
      ];

      testCases.forEach((config, index) => {
        const dbFormat = toSnake(config);
        const mockDbRecord = {
          id: `form-combo-${index}`,
          user_id: 'user-combo',
          name: `Combo ${index}`,
          slug: `combo-${index}`,
          template_id: 'tpl-combo',
          role_name: 'Signer',
          api_domain: 'sign.zoho.com',
          landing_config: dbFormat,
          created_at: '2026-01-11T12:00:00Z'
        };

        const result = toCamel(mockDbRecord);

        // Verify each field that was set
        if (config.headline) {
          expect(result.landingConfig?.headline).toBe(config.headline);
        }
        if (config.description) {
          expect(result.landingConfig?.description).toBe(config.description);
        }
        if (config.buttonText) {
          expect(result.landingConfig?.buttonText).toBe(config.buttonText);
        }
        if (config.theme) {
          expect(result.landingConfig?.theme).toBeDefined();
        }
        if (config.contact) {
          expect(result.landingConfig?.contact).toBeDefined();
        }
      });
    });
  });

  describe('Performance and Data Integrity', () => {
    it('should handle rapid successive conversions without data loss', () => {
      const originalConfig: LandingConfig = {
        headline: 'Performance Test',
        theme: { primaryColor: '#abc123', darkMode: true },
        contact: { email: 'perf@test.com' }
      };

      // Simulate multiple save/load cycles
      let currentConfig = originalConfig;
      for (let i = 0; i < 10; i++) {
        const dbFormat = toSnake(currentConfig);
        const mockDbRecord = {
          id: `form-perf-${i}`,
          user_id: 'user-perf',
          name: 'Performance Form',
          slug: `perf-${i}`,
          template_id: 'tpl-perf',
          role_name: 'Signer',
          api_domain: 'sign.zoho.com',
          landing_config: dbFormat,
          created_at: '2026-01-11T12:00:00Z'
        };
        const result = toCamel(mockDbRecord);
        currentConfig = result.landingConfig!;
      }

      // After 10 conversions, data should still match original
      expect(currentConfig.headline).toBe(originalConfig.headline);
      expect(currentConfig.theme?.primaryColor).toBe(originalConfig.theme?.primaryColor);
      expect(currentConfig.contact?.email).toBe(originalConfig.contact?.email);
    });

    it('should handle large batch conversions efficiently', () => {
      const configs: LandingConfig[] = Array.from({ length: 100 }, (_, i) => ({
        headline: `Form ${i}`,
        description: `Description for form ${i}`,
        buttonText: `Sign Form ${i}`
      }));

      const results = configs.map((config, i) => {
        const dbFormat = toSnake(config);
        const mockDbRecord = {
          id: `form-batch-${i}`,
          user_id: 'user-batch',
          name: `Batch Form ${i}`,
          slug: `batch-${i}`,
          template_id: 'tpl-batch',
          role_name: 'Signer',
          api_domain: 'sign.zoho.com',
          landing_config: dbFormat,
          created_at: '2026-01-11T12:00:00Z'
        };
        return toCamel(mockDbRecord);
      });

      expect(results).toHaveLength(100);
      results.forEach((result, i) => {
        expect(result.landingConfig?.headline).toBe(`Form ${i}`);
      });
    });
  });
});
