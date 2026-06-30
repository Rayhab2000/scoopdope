import * as AdmZip from 'adm-zip';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ScormImportStrategy } from './scorm-import.strategy';
import { Course } from '../../courses/course.entity';
import { CourseModule } from '../../courses/course-module.entity';
import { Lesson } from '../../courses/lesson.entity';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeManifest(options: {
  title?: string;
  items?: Array<{ id: string; title: string; resourceRef: string }>;
  resources?: Array<{ id: string; href: string }>;
} = {}): string {
  const items = options.items ?? [
    { id: 'item-1', title: 'Lesson One', resourceRef: 'res-1' },
  ];
  const resources = options.resources ?? [{ id: 'res-1', href: 'content/lesson1.html' }];

  const itemXml = items
    .map(
      (i) =>
        `<item identifier="${i.id}" identifierref="${i.resourceRef}"><title>${i.title}</title></item>`
    )
    .join('\n');

  const resourceXml = resources
    .map((r) => `<resource identifier="${r.id}" href="${r.href}" />`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="course-1">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="org-1">
    <organization identifier="org-1">
      <title>${options.title ?? 'Test Course'}</title>
      ${itemXml}
    </organization>
  </organizations>
  <resources>${resourceXml}</resources>
</manifest>`;
}

function buildZipBuffer(
  manifest: string,
  files: Array<{ name: string; content: string }> = [
    { name: 'content/lesson1.html', content: '<html><body>Hello</body></html>' },
  ]
): Buffer {
  const zip = new AdmZip();
  zip.addFile('imsmanifest.xml', Buffer.from(manifest));
  for (const f of files) {
    zip.addFile(f.name, Buffer.from(f.content));
  }
  return zip.toBuffer();
}

// ─── Mocks ──────────────────────────────────────────────────────────────────

function makeMockRepos() {
  const savedCourse = { id: 'course-uuid' } as Course;
  const savedModule = { id: 'module-uuid' } as CourseModule;

  const courseRepo = {
    create: jest.fn((dto) => ({ ...dto })),
    save: jest.fn().mockResolvedValue(savedCourse),
  } as unknown as jest.Mocked<Repository<Course>>;

  const moduleRepo = {
    create: jest.fn((dto) => ({ ...dto })),
    save: jest.fn().mockResolvedValue(savedModule),
  } as unknown as jest.Mocked<Repository<CourseModule>>;

  const lessonRepo = {
    create: jest.fn((dto) => ({ ...dto })),
    save: jest.fn().mockResolvedValue({ id: 'lesson-uuid' }),
  } as unknown as jest.Mocked<Repository<Lesson>>;

  return { courseRepo, moduleRepo, lessonRepo };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ScormImportStrategy', () => {
  let strategy: ScormImportStrategy;
  let courseRepo: jest.Mocked<Repository<Course>>;
  let moduleRepo: jest.Mocked<Repository<CourseModule>>;
  let lessonRepo: jest.Mocked<Repository<Lesson>>;

  beforeEach(() => {
    const repos = makeMockRepos();
    courseRepo = repos.courseRepo;
    moduleRepo = repos.moduleRepo;
    lessonRepo = repos.lessonRepo;
    strategy = new ScormImportStrategy(courseRepo, moduleRepo, lessonRepo);
  });

  describe('canHandle', () => {
    it('accepts application/zip', () => expect(strategy.canHandle('application/zip')).toBe(true));
    it('accepts application/x-zip-compressed', () =>
      expect(strategy.canHandle('application/x-zip-compressed')).toBe(true));
    it('rejects application/json', () => expect(strategy.canHandle('application/json')).toBe(false));
  });

  describe('import (buffer path)', () => {
    it('creates a course from a valid SCORM package', async () => {
      const manifest = makeManifest({ title: 'My Course' });
      const zipBuf = buildZipBuffer(manifest);

      const result = await strategy.import(zipBuf, 'user-1');

      expect(result).toEqual({ courseId: 'course-uuid' });
      expect(courseRepo.save).toHaveBeenCalledTimes(1);
      const saved = courseRepo.create.mock.calls[0][0] as Record<string, unknown>;
      expect(saved['instructorId']).toBe('user-1');
    });

    it('throws BadRequestException for a non-ZIP buffer', async () => {
      await expect(strategy.import(Buffer.from('not a zip'), 'user-1')).rejects.toThrow(
        BadRequestException
      );
    });

    it('throws BadRequestException when imsmanifest.xml is absent', async () => {
      const zip = new AdmZip();
      zip.addFile('readme.txt', Buffer.from('hello'));
      await expect(strategy.import(zip.toBuffer(), 'user-1')).rejects.toThrow(
        /imsmanifest\.xml not found/
      );
    });
  });

  describe('importFromPath', () => {
    it('creates a course from a zip written to disk', async () => {
      const manifest = makeManifest({ title: 'Disk Course' });
      const zipBuf = buildZipBuffer(manifest);
      const tmpPath = path.join(os.tmpdir(), `scorm-test-${Date.now()}.zip`);

      try {
        await fs.promises.writeFile(tmpPath, zipBuf);
        const result = await strategy.importFromPath(tmpPath, 'user-2');
        expect(result).toEqual({ courseId: 'course-uuid' });
      } finally {
        await fs.promises.unlink(tmpPath).catch(() => undefined);
      }
    });
  });

  describe('path traversal guard', () => {
    it('skips entries with ../ components and still imports successfully', async () => {
      const manifest = makeManifest({
        items: [{ id: 'item-1', title: 'Safe Lesson', resourceRef: 'res-safe' }],
        resources: [{ id: 'res-safe', href: 'content/safe.html' }],
      });

      const zip = new AdmZip();
      zip.addFile('imsmanifest.xml', Buffer.from(manifest));
      zip.addFile('content/safe.html', Buffer.from('<html>safe</html>'));
      // Malicious entry — path traversal attempt
      zip.addFile('../../../evil.sh', Buffer.from('#!/bin/sh\nrm -rf /'));

      const result = await strategy.import(zip.toBuffer(), 'user-3');

      expect(result.courseId).toBe('course-uuid');
      // The evil.sh entry must NOT land outside the extraction temp dir
      expect(fs.existsSync('/evil.sh')).toBe(false);
    });
  });

  describe('large synthetic SCORM package (memory regression)', () => {
    // Verifies that importing a package with many entries does not balloon heap
    // proportional to the uncompressed archive size. With adm-zip's old approach,
    // each getData() call allocated a new Buffer for every entry simultaneously.
    // With the yauzl streaming path, only one entry is ever in flight at a time.

    const ENTRY_COUNT = 80;
    const ENTRY_SIZE_BYTES = 512 * 1024; // 512 KB per entry → ~40 MB uncompressed

    let largeZipBuffer: Buffer;

    beforeAll(() => {
      const items = Array.from({ length: ENTRY_COUNT }, (_, i) => ({
        id: `item-${i}`,
        title: `Lesson ${i}`,
        resourceRef: `res-${i}`,
      }));
      const resources = Array.from({ length: ENTRY_COUNT }, (_, i) => ({
        id: `res-${i}`,
        href: `content/lesson${i}.html`,
      }));
      const files = Array.from({ length: ENTRY_COUNT }, (_, i) => ({
        name: `content/lesson${i}.html`,
        // Realistic but compressible HTML payload
        content: `<html><body>${'x'.repeat(ENTRY_SIZE_BYTES)}</body></html>`,
      }));

      largeZipBuffer = buildZipBuffer(makeManifest({ title: 'Large Course', items, resources }), files);
    }, 60_000);

    it('imports without heap growth proportional to uncompressed size', async () => {
      if (global.gc) global.gc(); // request GC if --expose-gc is set

      const heapBefore = process.memoryUsage().heapUsed;

      const result = await strategy.import(largeZipBuffer, 'user-perf');

      if (global.gc) global.gc();

      const heapAfterMB = (process.memoryUsage().heapUsed - heapBefore) / 1024 / 1024;
      const uncompressedMB = (ENTRY_COUNT * ENTRY_SIZE_BYTES) / 1024 / 1024;

      expect(result.courseId).toBe('course-uuid');
      // Heap growth must be well below holding the full uncompressed archive.
      // If adm-zip's getData() were still used, growth would approach uncompressedMB.
      expect(heapAfterMB).toBeLessThan(uncompressedMB * 0.5);
    }, 60_000);
  });
});
