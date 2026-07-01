import { describe, it, expect } from 'vitest';
import DOMPurify from 'dompurify';

// Mirror the exact config used in NotesPanel.tsx exportPdf() so tests
// stay in sync with production behaviour.
const PURIFY_CONFIG: DOMPurify.Config = {
  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li'],
  ALLOWED_ATTR: [],
};

function sanitize(input: string): string {
  return DOMPurify.sanitize(input, PURIFY_CONFIG);
}

describe('NotesPanel DOMPurify sanitization', () => {
  describe('script tag injection', () => {
    it('strips a bare <script> tag', () => {
      const result = sanitize('<script>alert("xss")</script>');
      expect(result).not.toContain('<script');
      expect(result).not.toContain('alert');
    });

    it('strips a <script> tag with src attribute', () => {
      const result = sanitize('<script src="https://evil.example/xss.js"></script>');
      expect(result).not.toContain('<script');
      expect(result).not.toContain('evil.example');
    });

    it('strips a script tag embedded inside allowed markup', () => {
      const result = sanitize('<b>Hello <script>alert(1)</script> World</b>');
      expect(result).not.toContain('<script');
      expect(result).toContain('Hello');
      expect(result).toContain('World');
    });
  });

  describe('onerror / inline event handler injection', () => {
    it('strips onerror from an img tag', () => {
      const result = sanitize('<img src="x" onerror="alert(1)">');
      expect(result).not.toContain('onerror');
      expect(result).not.toContain('<img');
    });

    it('strips onclick from an allowed tag', () => {
      const result = sanitize('<b onclick="alert(1)">Click me</b>');
      expect(result).not.toContain('onclick');
      expect(result).toContain('Click me');
    });

    it('strips onmouseover from a span', () => {
      const result = sanitize('<span onmouseover="steal()">hover me</span>');
      expect(result).not.toContain('onmouseover');
    });

    it('strips all event handlers even on allowed tags', () => {
      const result = sanitize('<em onload="steal()" onfocus="xss()">text</em>');
      expect(result).not.toMatch(/on\w+=/);
      expect(result).toContain('text');
    });
  });

  describe('javascript: URL scheme injection', () => {
    it('strips javascript: href from anchor tags', () => {
      const result = sanitize('<a href="javascript:alert(1)">click</a>');
      expect(result).not.toContain('javascript:');
    });

    it('strips javascript: from src attributes', () => {
      const result = sanitize('<img src="javascript:alert(1)">');
      expect(result).not.toContain('javascript:');
    });

    it('strips data: URI scheme that can carry scripts', () => {
      const result = sanitize('<a href="data:text/html,<script>alert(1)</script>">link</a>');
      expect(result).not.toContain('data:');
    });
  });

  describe('SVG / HTML5 vector injection', () => {
    it('strips SVG with embedded script', () => {
      const result = sanitize('<svg><script>alert(1)</script></svg>');
      expect(result).not.toContain('<svg');
      expect(result).not.toContain('<script');
    });

    it('strips iframe tags', () => {
      const result = sanitize('<iframe src="https://evil.example"></iframe>');
      expect(result).not.toContain('<iframe');
    });

    it('strips object tags', () => {
      const result = sanitize('<object data="https://evil.example/flash.swf"></object>');
      expect(result).not.toContain('<object');
    });
  });

  describe('allowlist preserves safe formatting', () => {
    it('keeps allowed inline tags', () => {
      const result = sanitize('<b>bold</b> and <i>italic</i> and <em>emphasis</em> and <strong>strong</strong>');
      expect(result).toContain('<b>bold</b>');
      expect(result).toContain('<i>italic</i>');
      expect(result).toContain('<em>emphasis</em>');
      expect(result).toContain('<strong>strong</strong>');
    });

    it('keeps allowed block tags', () => {
      const result = sanitize('<ul><li>item one</li><li>item two</li></ul>');
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>item one</li>');
    });

    it('passes plain text through unchanged', () => {
      const plain = 'Just a regular note with no HTML at all.';
      expect(sanitize(plain)).toBe(plain);
    });

    it('preserves line breaks via <br>', () => {
      const result = sanitize('line one<br>line two');
      expect(result).toContain('<br>');
    });
  });
});
