/**
 * Accessibility Utilities
 * WCAG 2.1 compliance helpers for color contrast and validation
 */

/**
 * Calculate relative luminance of a color
 * Based on WCAG 2.1 formula: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function getRelativeLuminance(hex: string): number {
  // Remove # if present
  const rgb = hex.replace('#', '');
  
  // Parse hex to RGB
  const r = parseInt(rgb.substr(0, 2), 16) / 255;
  const g = parseInt(rgb.substr(2, 2), 16) / 255;
  const b = parseInt(rgb.substr(4, 2), 16) / 255;
  
  // NOTE: WCAG 2.0/2.1/2.2 normative text specifies 0.03928, but 0.04045 is the
  // colorimetrically correct IEC 61966-2-1 (sRGB) threshold. This utility is used for
  // dynamic button text color selection, not formal conformance auditing, so the
  // colorimetrically correct value is preferred. Formal checkers may report a minor
  // discrepancy for edge-case colors near this threshold.
  const rsRGB = r <= 0.04045 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  const gsRGB = g <= 0.04045 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  const bsRGB = b <= 0.04045 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
  
  // Calculate luminance
  return 0.2126 * rsRGB + 0.7152 * gsRGB + 0.0722 * bsRGB;
}

/**
 * Calculate contrast ratio between two colors
 * Based on WCAG 2.1 formula: https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */
export function getContrastRatio(color1: string, color2: string): number {
  const lum1 = getRelativeLuminance(color1);
  const lum2 = getRelativeLuminance(color2);
  
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if color combination meets WCAG AA standard
 * @param foreground - Text color
 * @param background - Background color
 * @param level - 'AA' or 'AAA'
 * @param largeText - True for text >= 18pt (or 14pt bold)
 * @returns true if contrast meets requirements
 */
export function meetsContrastRequirement(
  foreground: string,
  background: string,
  level: 'AA' | 'AAA' = 'AA',
  largeText: boolean = false
): boolean {
  const ratio = getContrastRatio(foreground, background);
  
  // WCAG 2.1 Level AA requirements
  if (level === 'AA') {
    return largeText ? ratio >= 3 : ratio >= 4.5;
  }
  
  // WCAG 2.1 Level AAA requirements
  return largeText ? ratio >= 4.5 : ratio >= 7;
}

/**
 * Validate color contrast and return validation result with suggestions
 */
export interface ContrastValidation {
  valid: boolean;
  ratio: number;
  required: number;
  level: 'AA' | 'AAA';
  suggestion?: string;
}

export function validateContrast(
  foreground: string,
  background: string,
  level: 'AA' | 'AAA' = 'AA',
  largeText: boolean = false
): ContrastValidation {
  const ratio = getContrastRatio(foreground, background);
  const required = level === 'AA' ? (largeText ? 3 : 4.5) : (largeText ? 4.5 : 7);
  const valid = ratio >= required;
  
  const result: ContrastValidation = {
    valid,
    ratio: Math.round(ratio * 100) / 100,
    required,
    level
  };
  
  if (!valid) {
    result.suggestion = `Contrast ratio ${result.ratio.toFixed(2)}:1 is below ${required}:1 requirement. ${
      largeText ? 'Consider making text darker or lighter.' : 'Use higher contrast colors or larger/bold text.'
    }`;
  }
  
  return result;
}

/**
 * Validate alt text quality
 * Checks for common issues like missing text, too short, or placeholder values
 */
export interface AltTextValidation {
  valid: boolean;
  errors: string[];
}

export function validateAltText(altText: string | undefined): AltTextValidation {
  const errors: string[] = [];
  
  if (!altText || altText.trim().length === 0) {
    errors.push('Alt text is required for images');
    return { valid: false, errors };
  }
  
  const trimmed = altText.trim();
  
  // Check minimum length (should describe the image)
  if (trimmed.length < 5) {
    errors.push('Alt text is too short (minimum 5 characters)');
  }
  
  // Check for placeholder values
  const placeholders = ['image', 'picture', 'photo', 'logo', 'icon', 'graphic', 'img'];
  if (placeholders.includes(trimmed.toLowerCase())) {
    errors.push('Alt text should describe the image content, not just its type');
  }
  
  // Check for file extensions (common mistake)
  if (/\.(jpg|jpeg|png|gif|svg|webp)$/i.test(trimmed)) {
    errors.push('Alt text should not include file extensions');
  }
  
  // Check for excessive length (screen readers may truncate)
  if (trimmed.length > 125) {
    errors.push('Alt text is too long (maximum 125 characters recommended)');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Generate contrast-safe text color (black or white) for a background
 */
export function getContrastTextColor(backgroundColor: string): string {
  const ratio = getContrastRatio('#FFFFFF', backgroundColor);
  // If white has good contrast, use white, otherwise use black
  return ratio >= 4.5 ? '#FFFFFF' : '#000000';
}

/**
 * Keyboard event helpers
 */
export const KeyCodes = {
  ENTER: 'Enter',
  ESCAPE: 'Escape',
  SPACE: ' ',
  TAB: 'Tab',
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight',
  HOME: 'Home',
  END: 'End'
} as const;

export function isKeyPressed(event: React.KeyboardEvent, key: string): boolean {
  return event.key === key;
}

export function handleEnterOrSpace(
  event: React.KeyboardEvent,
  callback: () => void
): void {
  if (isKeyPressed(event, KeyCodes.ENTER) || isKeyPressed(event, KeyCodes.SPACE)) {
    event.preventDefault();
    callback();
  }
}
