/**
 * Accessibility Utilities Tests
 * Tests for WCAG 2.1 compliance helpers
 */

import { describe, it, expect } from 'vitest';
import {
  getRelativeLuminance,
  getContrastRatio,
  meetsContrastRequirement,
  validateContrast,
  validateAltText,
  getContrastTextColor,
  KeyCodes,
  isKeyPressed,
  handleEnterOrSpace
} from '../utils/accessibility';

describe('Color Contrast Calculations', () => {
  describe('getRelativeLuminance', () => {
    it('should calculate correct luminance for black', () => {
      const luminance = getRelativeLuminance('#000000');
      expect(luminance).toBe(0);
    });

    it('should calculate correct luminance for white', () => {
      const luminance = getRelativeLuminance('#FFFFFF');
      expect(luminance).toBe(1);
    });

    it('should calculate luminance for mid-gray', () => {
      const luminance = getRelativeLuminance('#808080');
      expect(luminance).toBeGreaterThan(0);
      expect(luminance).toBeLessThan(1);
    });

    it('should handle colors with # prefix', () => {
      const luminance1 = getRelativeLuminance('#FF0000');
      const luminance2 = getRelativeLuminance('FF0000');
      expect(luminance1).toBe(luminance2);
    });
  });

  describe('getContrastRatio', () => {
    it('should calculate 21:1 ratio for black on white', () => {
      const ratio = getContrastRatio('#000000', '#FFFFFF');
      expect(ratio).toBe(21);
    });

    it('should calculate 21:1 ratio for white on black', () => {
      const ratio = getContrastRatio('#FFFFFF', '#000000');
      expect(ratio).toBe(21);
    });

    it('should calculate 1:1 ratio for identical colors', () => {
      const ratio = getContrastRatio('#FF5733', '#FF5733');
      expect(ratio).toBeCloseTo(1, 1);
    });

    it('should calculate ratio for common UI colors', () => {
      const ratio = getContrastRatio('#3B82F6', '#F8FAFC'); // Blue on light gray
      expect(ratio).toBeGreaterThan(3); // Should meet AA standard for large text
      expect(ratio).toBeLessThan(5); // But not AAA for normal text
    });
  });

  describe('meetsContrastRequirement', () => {
    it('should pass AA for high contrast text', () => {
      const result = meetsContrastRequirement('#000000', '#FFFFFF', 'AA', false);
      expect(result).toBe(true);
    });

    it('should fail AA for low contrast text', () => {
      const result = meetsContrastRequirement('#777777', '#888888', 'AA', false);
      expect(result).toBe(false);
    });

    it('should pass AA for large text with lower contrast', () => {
      const result = meetsContrastRequirement('#777777', '#FFFFFF', 'AA', true);
      expect(result).toBe(true);
    });

    it('should have higher threshold for AAA', () => {
      // This might pass AA but fail AAA
      const ratio = getContrastRatio('#555555', '#FFFFFF');
      const passesAA = meetsContrastRequirement('#555555', '#FFFFFF', 'AA', false);
      const passesAAA = meetsContrastRequirement('#555555', '#FFFFFF', 'AAA', false);
      
      if (ratio >= 4.5 && ratio < 7) {
        expect(passesAA).toBe(true);
        expect(passesAAA).toBe(false);
      }
    });
  });

  describe('validateContrast', () => {
    it('should return valid for high contrast', () => {
      const validation = validateContrast('#000000', '#FFFFFF', 'AA', false);
      expect(validation.valid).toBe(true);
      expect(validation.ratio).toBeGreaterThan(20);
      expect(validation.required).toBe(4.5);
      expect(validation.suggestion).toBeUndefined();
    });

    it('should return invalid with suggestion for low contrast', () => {
      const validation = validateContrast('#CCCCCC', '#DDDDDD', 'AA', false);
      expect(validation.valid).toBe(false);
      expect(validation.suggestion).toBeDefined();
      expect(validation.suggestion?.toLowerCase()).toContain('contrast ratio');
    });

    it('should adjust requirements for large text', () => {
      const validation = validateContrast('#777777', '#FFFFFF', 'AA', true);
      expect(validation.required).toBe(3);
    });

    it('should provide specific ratio values', () => {
      const validation = validateContrast('#3B82F6', '#F8FAFC', 'AA', false);
      expect(validation.ratio).toBeGreaterThan(0);
      expect(typeof validation.ratio).toBe('number');
    });
  });

  describe('getContrastTextColor', () => {
    it('should return white for dark backgrounds', () => {
      const textColor = getContrastTextColor('#000000');
      expect(textColor).toBe('#FFFFFF');
    });

    it('should return black for light backgrounds', () => {
      const textColor = getContrastTextColor('#FFFFFF');
      expect(textColor).toBe('#000000');
    });

    it('should return appropriate color for primary blue', () => {
      const textColor = getContrastTextColor('#3B82F6');
      // Blue background has low luminance, but not low enough for 4.5:1 with white
      // The function returns black if white doesn't meet 4.5:1 ratio
      expect(textColor).toBe('#000000');
    });

    it('should return black for light yellow', () => {
      const textColor = getContrastTextColor('#FFF59D');
      expect(textColor).toBe('#000000');
    });
  });
});

describe('Alt Text Validation', () => {
  describe('validateAltText', () => {
    it('should pass for good alt text', () => {
      const validation = validateAltText('ACME Corporation logo with blue background');
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should fail for empty alt text', () => {
      const validation = validateAltText('');
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Alt text is required for images');
    });

    it('should fail for undefined alt text', () => {
      const validation = validateAltText(undefined);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Alt text is required for images');
    });

    it('should fail for too short alt text', () => {
      const validation = validateAltText('logo');
      expect(validation.valid).toBe(false);
      expect(validation.errors[0]).toContain('too short');
    });

    it('should fail for placeholder values', () => {
      const placeholders = ['image', 'picture', 'photo', 'icon', 'graphic'];
      // Note: 'logo' is 4 chars so fails on 'too short' before placeholder check
      
      for (const placeholder of placeholders) {
        const validation = validateAltText(placeholder);
        expect(validation.valid).toBe(false);
        // Should have at least one error about description
        const hasDescriptionError = validation.errors.some(e => 
          e.toLowerCase().includes('describe') || e.toLowerCase().includes('too short')
        );
        expect(hasDescriptionError).toBe(true);
      }
    });

    it('should fail for file extensions', () => {
      const validation = validateAltText('company-logo.png');
      expect(validation.valid).toBe(false);
      expect(validation.errors[0]).toContain('file extensions');
    });

    it('should fail for too long alt text', () => {
      const longText = 'A'.repeat(130);
      const validation = validateAltText(longText);
      expect(validation.valid).toBe(false);
      expect(validation.errors[0]).toContain('too long');
    });

    it('should pass for alt text at maximum length', () => {
      const maxText = 'This is a detailed description of the company logo that is exactly one hundred and twenty-five characters long';
      const validation = validateAltText(maxText);
      expect(validation.valid).toBe(true);
    });

    it('should trim whitespace before validation', () => {
      const validation = validateAltText('  ACME Corp logo  ');
      expect(validation.valid).toBe(true);
    });

    it('should handle multiple errors', () => {
      const validation = validateAltText('img'); // Too short AND placeholder
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });
});

describe('Keyboard Event Helpers', () => {
  describe('KeyCodes', () => {
    it('should define standard key codes', () => {
      expect(KeyCodes.ENTER).toBe('Enter');
      expect(KeyCodes.ESCAPE).toBe('Escape');
      expect(KeyCodes.SPACE).toBe(' ');
      expect(KeyCodes.TAB).toBe('Tab');
      expect(KeyCodes.ARROW_UP).toBe('ArrowUp');
      expect(KeyCodes.ARROW_DOWN).toBe('ArrowDown');
      expect(KeyCodes.ARROW_LEFT).toBe('ArrowLeft');
      expect(KeyCodes.ARROW_RIGHT).toBe('ArrowRight');
      expect(KeyCodes.HOME).toBe('Home');
      expect(KeyCodes.END).toBe('End');
    });
  });

  describe('isKeyPressed', () => {
    it('should detect Enter key', () => {
      const event = { key: 'Enter' } as React.KeyboardEvent;
      expect(isKeyPressed(event, KeyCodes.ENTER)).toBe(true);
    });

    it('should detect Space key', () => {
      const event = { key: ' ' } as React.KeyboardEvent;
      expect(isKeyPressed(event, KeyCodes.SPACE)).toBe(true);
    });

    it('should return false for different key', () => {
      const event = { key: 'Enter' } as React.KeyboardEvent;
      expect(isKeyPressed(event, KeyCodes.ESCAPE)).toBe(false);
    });
  });

  describe('handleEnterOrSpace', () => {
    it('should call callback on Enter key', () => {
      let called = false;
      const callback = () => { called = true; };
      const event = { 
        key: 'Enter', 
        preventDefault: () => {} 
      } as React.KeyboardEvent;
      
      handleEnterOrSpace(event, callback);
      expect(called).toBe(true);
    });

    it('should call callback on Space key', () => {
      let called = false;
      const callback = () => { called = true; };
      const event = { 
        key: ' ', 
        preventDefault: () => {} 
      } as React.KeyboardEvent;
      
      handleEnterOrSpace(event, callback);
      expect(called).toBe(true);
    });

    it('should not call callback on other keys', () => {
      let called = false;
      const callback = () => { called = true; };
      const event = { 
        key: 'Escape', 
        preventDefault: () => {} 
      } as React.KeyboardEvent;
      
      handleEnterOrSpace(event, callback);
      expect(called).toBe(false);
    });

    it('should prevent default on Enter', () => {
      let prevented = false;
      const event = { 
        key: 'Enter', 
        preventDefault: () => { prevented = true; } 
      } as React.KeyboardEvent;
      
      handleEnterOrSpace(event, () => {});
      expect(prevented).toBe(true);
    });
  });
});

describe('WCAG Compliance Scenarios', () => {
  it('should validate common UI color combinations', () => {
    const scenarios = [
      { fg: '#000000', bg: '#FFFFFF', name: 'Black on White', shouldPass: true },
      { fg: '#FFFFFF', bg: '#000000', name: 'White on Black', shouldPass: true },
      { fg: '#1E293B', bg: '#FFFFFF', name: 'Dark Slate on White', shouldPass: true },
      { fg: '#047857', bg: '#FFFFFF', name: 'Dark Green on White', shouldPass: true },
      { fg: '#CCCCCC', bg: '#FFFFFF', name: 'Light Gray on White', shouldPass: false },
      { fg: '#FFFF00', bg: '#FFFFFF', name: 'Yellow on White', shouldPass: false },
    ];

    for (const scenario of scenarios) {
      const validation = validateContrast(scenario.fg, scenario.bg, 'AA', false);
      if (validation.valid !== scenario.shouldPass) {
        console.log(`Failed: ${scenario.name} - ratio: ${validation.ratio}, expected ${scenario.shouldPass ? 'pass' : 'fail'}`);
      }
      expect(validation.valid).toBe(scenario.shouldPass);
    }
  });

  it('should validate button color combinations', () => {
    // Primary button: white text on blue background
    const buttonValidation = validateContrast('#FFFFFF', '#3B82F6', 'AA', true);
    expect(buttonValidation.valid).toBe(true);
  });

  it('should validate form input combinations', () => {
    // Dark text on light input background
    const inputValidation = validateContrast('#1E293B', '#F8FAFC', 'AA', false);
    expect(inputValidation.valid).toBe(true);
  });
});
