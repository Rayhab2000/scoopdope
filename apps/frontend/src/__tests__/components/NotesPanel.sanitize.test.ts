/**
 * Unit tests for the HTML sanitization utility used by NotesPanel.
 *
 * These tests assert that common XSS vectors are neutralised before any
 * sanitized content reaches the DOM, and that safe inline HTML is
 * preserved after the migration from the old escHtml() to DOMPurify.
 *
 * Issue: NotesPanel.tsx HTML Sanitization Has No Unit Tests
 * Related issue: #26 (migration to DOMPurify)
 */

import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from '@/lib/sanitize';

// ---------------------------------------------------------------------------
// XSS vector tests
// ---------------------------------------------------------------------------

describe('sanitizeHtml — XSS vectors', () => {
  it('strips <script> tags and their contents', () => {
    const input = 'Hello <script>alert("xss")</script> world';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('<script>');
    expect(output).not.toContain('alert');
    expect(output).toContain('Hello');
    expect(output).toContain('world');
  });

  it('strips <script> with type attribute', () => {
    const input = '<script type="text/javascript">document.cookie</script>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('<script');
    expect(output).not.toContain('document.cookie');
  });

  it('strips inline event handlers (onerror)', () => {
    const input = '<img src="x" onerror="alert(1)">';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('onerror');
    expect(output).not.toContain('alert');
  });

  it('strips inline event handlers (onload)', () => {
    const input = '<body onload="stealCookies()">content</body>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('onload');
    expect(output).not.toContain('stealCookies');
  });

  it('strips inline event handlers (onclick)', () => {
    const input = '<div onclick="evil()">click me</div>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('onclick');
    expect(output).not.toContain('evil()');
  });

  it('blocks javascript: URI in href', () => {
    const input = '<a href="javascript:alert(1)">click me</a>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('javascript:');
    // The anchor text should still be present (DOMPurify keeps the tag but
    // removes the dangerous attribute)
    expect(output).toContain('click me');
  });

  it('blocks javascript: URI with mixed case', () => {
    const input = '<a href="JaVaScRiPt:alert(1)">link</a>';
    const output = sanitizeHtml(input);
    expect(output.toLowerCase()).not.toContain('javascript:');
  });

  it('blocks javascript: URI with whitespace padding', () => {
    const input = '<a href="  javascript:alert(1)">link</a>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('javascript:');
  });

  it('strips <iframe> tags', () => {
    const input = '<iframe src="https://evil.com"></iframe>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('<iframe');
  });
});

// ---------------------------------------------------------------------------
// Safe HTML preservation tests (post-DOMPurify migration)
// ---------------------------------------------------------------------------

describe('sanitizeHtml — safe HTML preservation', () => {
  it('preserves <b> tags', () => {
    const input = '<b>bold text</b>';
    const output = sanitizeHtml(input);
    expect(output).toContain('<b>');
    expect(output).toContain('bold text');
    expect(output).toContain('</b>');
  });

  it('preserves <i> tags', () => {
    const input = '<i>italic text</i>';
    const output = sanitizeHtml(input);
    expect(output).toContain('<i>');
    expect(output).toContain('italic text');
    expect(output).toContain('</i>');
  });

  it('preserves <strong> tags', () => {
    const input = '<strong>important</strong>';
    const output = sanitizeHtml(input);
    expect(output).toContain('<strong>');
    expect(output).toContain('important');
  });

  it('preserves <em> tags', () => {
    const input = '<em>emphasis</em>';
    const output = sanitizeHtml(input);
    expect(output).toContain('<em>');
    expect(output).toContain('emphasis');
  });

  it('preserves plain text unchanged', () => {
    const input = 'Just a plain note about Stellar blockchain.';
    const output = sanitizeHtml(input);
    expect(output).toBe(input);
  });

  it('preserves safe mixed content', () => {
    const input = 'This is <b>bold</b> and <i>italic</i> text.';
    const output = sanitizeHtml(input);
    expect(output).toContain('<b>bold</b>');
    expect(output).toContain('<i>italic</i>');
    expect(output).toContain('This is');
    expect(output).toContain('text.');
  });

  it('handles empty string without error', () => {
    expect(() => sanitizeHtml('')).not.toThrow();
    expect(sanitizeHtml('')).toBe('');
  });
});
