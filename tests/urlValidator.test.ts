import { describe, it, expect } from 'vitest';
import { validateUrl, sanitizeUrl, getUrlValidationError } from '../api/utils/urlValidator';

describe('URL Validator', () => {
  describe('validateUrl', () => {
    it('allows valid HTTPS URLs', () => {
      expect(validateUrl('https://example.com/logo.png')).toBe(true);
      expect(validateUrl('https://cdn.example.com/images/logo.png')).toBe(true);
      expect(validateUrl('https://www.example.com/path/to/image.jpg')).toBe(true);
      expect(validateUrl('https://sub.domain.example.com/file.svg')).toBe(true);
    });
    
    it('allows undefined or empty URLs (optional fields)', () => {
      expect(validateUrl(undefined)).toBe(true);
      expect(validateUrl('')).toBe(true);
    });
    
    it('rejects HTTP URLs', () => {
      expect(validateUrl('http://example.com/logo.png')).toBe(false);
      expect(validateUrl('http://insecure.site/image.jpg')).toBe(false);
    });
    
    it('rejects javascript: URIs', () => {
      expect(validateUrl('javascript:alert(1)')).toBe(false);
      expect(validateUrl('javascript:void(0)')).toBe(false);
    });
    
    it('rejects data: URIs', () => {
      expect(validateUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
      expect(validateUrl('data:image/png;base64,iVBORw0KGgoAAAANS')).toBe(false);
    });
    
    it('rejects file: URIs', () => {
      expect(validateUrl('file:///etc/passwd')).toBe(false);
      expect(validateUrl('file://localhost/path/to/file')).toBe(false);
    });
    
    it('rejects localhost URLs', () => {
      expect(validateUrl('https://localhost/logo.png')).toBe(false);
      expect(validateUrl('https://localhost:8080/image.jpg')).toBe(false);
    });
    
    it('rejects 127.x.x.x loopback addresses', () => {
      expect(validateUrl('https://127.0.0.1/logo.png')).toBe(false);
      expect(validateUrl('https://127.0.0.1:3000/image.jpg')).toBe(false);
      expect(validateUrl('https://127.1.2.3/file.png')).toBe(false);
    });
    
    it('rejects IPv6 localhost', () => {
      expect(validateUrl('https://[::1]/logo.png')).toBe(false);
    });
    
    it('rejects private IP ranges (192.168.x.x)', () => {
      expect(validateUrl('https://192.168.1.1/logo.png')).toBe(false);
      expect(validateUrl('https://192.168.0.100/image.jpg')).toBe(false);
      expect(validateUrl('https://192.168.255.255/file.png')).toBe(false);
    });
    
    it('rejects private IP ranges (10.x.x.x)', () => {
      expect(validateUrl('https://10.0.0.1/logo.png')).toBe(false);
      expect(validateUrl('https://10.1.2.3/image.jpg')).toBe(false);
      expect(validateUrl('https://10.255.255.255/file.png')).toBe(false);
    });
    
    it('rejects private IP ranges (172.16.x.x - 172.31.x.x)', () => {
      expect(validateUrl('https://172.16.0.1/logo.png')).toBe(false);
      expect(validateUrl('https://172.20.10.5/image.jpg')).toBe(false);
      expect(validateUrl('https://172.31.255.255/file.png')).toBe(false);
    });
    
    it('allows non-private 172.x.x.x ranges', () => {
      expect(validateUrl('https://172.15.0.1/logo.png')).toBe(true); // Before 172.16
      expect(validateUrl('https://172.32.0.1/logo.png')).toBe(true); // After 172.31
    });
    
    it('rejects link-local addresses (169.254.x.x)', () => {
      expect(validateUrl('https://169.254.0.1/logo.png')).toBe(false);
      expect(validateUrl('https://169.254.169.254/metadata')).toBe(false); // AWS metadata service
    });
    
    it('rejects invalid URL formats', () => {
      expect(validateUrl('not-a-url')).toBe(false);
      expect(validateUrl('ftp://example.com/file')).toBe(false);
      expect(validateUrl('://missing-protocol')).toBe(false);
      expect(validateUrl('https://')).toBe(false);
    });
  });
  
  describe('sanitizeUrl', () => {
    it('returns validated HTTPS URLs', () => {
      expect(sanitizeUrl('https://example.com/logo.png')).toBe('https://example.com/logo.png');
      expect(sanitizeUrl('  https://example.com/logo.png  ')).toBe('https://example.com/logo.png');
    });
    
    it('returns undefined for empty inputs', () => {
      expect(sanitizeUrl(undefined)).toBe(undefined);
      expect(sanitizeUrl('')).toBe(undefined);
    });
    
    it('throws error for invalid URLs', () => {
      expect(() => sanitizeUrl('http://example.com')).toThrow('Invalid or unsafe URL');
      expect(() => sanitizeUrl('javascript:alert(1)')).toThrow('Invalid or unsafe URL');
      expect(() => sanitizeUrl('https://localhost/file')).toThrow('Invalid or unsafe URL');
    });
  });
  
  describe('getUrlValidationError', () => {
    it('returns descriptive error for HTTP URLs', () => {
      const error = getUrlValidationError('http://example.com');
      expect(error).toContain('HTTPS');
      expect(error).toContain('protocol');
    });
    
    it('returns descriptive error for invalid formats', () => {
      const error = getUrlValidationError('not-a-url');
      expect(error).toContain('Invalid URL format');
    });
    
    it('returns descriptive error for private IPs', () => {
      const error = getUrlValidationError('https://192.168.1.1/logo.png');
      expect(error).toContain('Private');
      expect(error).toContain('not allowed');
    });
    
    it('returns descriptive error for localhost', () => {
      const error = getUrlValidationError('https://localhost/logo.png');
      expect(error).toContain('localhost');
      expect(error).toContain('not allowed');
    });
  });
});
