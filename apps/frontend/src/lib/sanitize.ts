/**
 * sanitize.ts
 *
 * HTML sanitization utility for rendering user-generated content safely.
 * Uses DOMPurify to strip dangerous markup (XSS vectors) while preserving
 * safe inline elements such as <b> and <i>.
 *
 * This module is intentionally framework-agnostic and has no React/Next
 * dependency so it can be imported and unit-tested in isolation.
 */

import DOMPurify from 'dompurify';

/**
 * Sanitizes an HTML string by removing script tags, event handlers, and
 * dangerous URI schemes (e.g. javascript:) while preserving safe inline
 * formatting such as <b>, <i>, and plain text.
 *
 * @param dirty - Untrusted HTML string (e.g. user note content)
 * @returns A sanitized HTML string safe for insertion into the DOM
 *
 * @example
 * sanitizeHtml('<b>hello</b><script>alert(1)</script>')
 * // → '<b>hello</b>'
 *
 * sanitizeHtml('<a href="javascript:alert(1)">click</a>')
 * // → '<a>click</a>'
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    // Allow only safe inline formatting; strip everything else
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['href', 'title'],
    // Block javascript: and data: URIs in href
    ALLOW_DATA_ATTR: false,
    FORCE_BODY: false,
  });
}
