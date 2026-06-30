import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import * as AdmZip from 'adm-zip';
import { ScormImportStrategy } from './scorm-import.strategy';
import { Course } from '../../courses/course.entity';
import { CourseModule } from '../../courses/course-module.entity';
import { Lesson } from '../../courses/lesson.entity';

describe('ScormImportStrategy - Path Traversal Security', () => {
  let strategy: ScormImportStrategy;
  let courseRepo: jest.Mocked<Repository<Course>>;
  let moduleRepo: jest.Mocked<Repository<CourseModule>>;
  let lessonRepo: jest.Mocked<Repository<Lesson>>;

  beforeEach(() => {
    courseRepo = {
      save: jest.fn(),
      create: jest.fn(),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<Course>>;

    moduleRepo = {
      save: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<Repository<CourseModule>>;

    lessonRepo = {
      save: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<Repository<Lesson>>;

    strategy = new ScormImportStrategy(courseRepo, moduleRepo, lessonRepo);
  });

  describe('Path Traversal Validation', () => {
    /**
     * Creates a malicious SCORM ZIP with a path traversal entry.
     * The href attempts to escape the package using ../../../../ patterns.
     */
    it('should reject a SCORM package with path traversal in resource href (../ attack)', async () => {
      const zip = new AdmZip();

      // Create manifest with path traversal attempt
      const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="course-1" version="1.0">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 3rd Edition</schemaversion>
  </metadata>
  <organizations>
    <organization identifier="org-1" title="Test Course">
      <item identifier="item-1" title="Module 1">
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="res-1" type="webcontent" href="../../../../etc/passwd">
      <file href="../../../../etc/passwd"/>
    </resource>
  </resources>
</manifest>`;

      zip.addFile('imsmanifest.xml', Buffer.from(manifest), '', 0);
      zip.addFile('content.html', Buffer.from('<html>Content</html>'), '', 0);

      const zipBuffer = zip.toBuffer();

      await expect(strategy.import(zipBuffer, 'user-123')).rejects.toThrow(BadRequestException);
      await expect(strategy.import(zipBuffer, 'user-123')).rejects.toThrow(
        /path traversal detected|Entry paths must remain/i
      );
    });

    /**
     * Tests rejection of Windows-style path traversal patterns.
     */
    it('should reject SCORM packages with Windows-style path traversal (..\\ patterns)', async () => {
      const zip = new AdmZip();

      const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="course-2" version="1.0">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 3rd Edition</schemaversion>
  </metadata>
  <organizations>
    <organization identifier="org-1" title="Test Course">
      <item identifier="item-1" title="Module 1">
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="res-1" type="webcontent" href="..\\..\\..\\app.js">
      <file href="..\\..\\..\\app.js"/>
    </resource>
  </resources>
</manifest>`;

      zip.addFile('imsmanifest.xml', Buffer.from(manifest), '', 0);

      const zipBuffer = zip.toBuffer();

      await expect(strategy.import(zipBuffer, 'user-456')).rejects.toThrow(BadRequestException);
      await expect(strategy.import(zipBuffer, 'user-456')).rejects.toThrow(
        /path traversal detected|Entry paths must remain/i
      );
    });

    /**
     * Tests rejection of encoded path traversal attempts (%2e%2e).
     */
    it('should reject SCORM packages with URL-encoded path traversal (%2e%2e)', async () => {
      const zip = new AdmZip();

      const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="course-3" version="1.0">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 3rd Edition</schemaversion>
  </metadata>
  <organizations>
    <organization identifier="org-1" title="Test Course">
      <item identifier="item-1" title="Module 1">
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="res-1" type="webcontent" href="..%2f..%2fetc%2fpasswd">
      <file href="..%2f..%2fetc%2fpasswd"/>
    </resource>
  </resources>
</manifest>`;

      zip.addFile('imsmanifest.xml', Buffer.from(manifest), '', 0);

      const zipBuffer = zip.toBuffer();

      // Encoded traversal should also be rejected during validation
      await expect(strategy.import(zipBuffer, 'user-789')).rejects.toThrow(BadRequestException);
    });

    /**
     * Tests acceptance of valid relative paths within the package.
     * Valid paths like "content/lesson1.html" should be allowed.
     */
    it('should accept valid relative paths within the SCORM package', async () => {
      const zip = new AdmZip();

      const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="course-4" version="1.0">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 3rd Edition</schemaversion>
  </metadata>
  <organizations>
    <organization identifier="org-1" title="Valid Course">
      <item identifier="item-1" title="Module 1" identifierref="res-1">
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="res-1" type="webcontent" href="content/lesson1.html">
      <file href="content/lesson1.html"/>
    </resource>
  </resources>
</manifest>`;

      zip.addFile('imsmanifest.xml', Buffer.from(manifest), '', 0);
      zip.addFile('content/lesson1.html', Buffer.from('<html>Lesson 1</html>'), '', 0);

      const course = {
        id: 'course-id',
        title: 'Valid Course',
        description: 'Imported from SCORM package',
        level: 'beginner',
        durationHours: 0,
        requiresKyc: false,
        instructorId: 'user-101',
        isPublished: false,
      } as Course;

      const module = {
        id: 'module-id',
        courseId: 'course-id',
        title: 'Module 1',
        order: 0,
      } as CourseModule;

      const lesson = {
        id: 'lesson-id',
        moduleId: 'module-id',
        title: 'Module 1',
        content: '<html>Lesson 1</html>',
        videoUrl: undefined,
        order: 0,
        durationMinutes: 0,
      } as Lesson;

      courseRepo.create.mockReturnValue(course);
      courseRepo.save.mockResolvedValue(course);
      moduleRepo.create.mockReturnValue(module);
      moduleRepo.save.mockResolvedValue(module);
      lessonRepo.create.mockReturnValue(lesson);
      lessonRepo.save.mockResolvedValue(lesson);

      const zipBuffer = zip.toBuffer();

      const result = await strategy.import(zipBuffer, 'user-101');

      expect(result).toEqual({ courseId: 'course-id' });
      expect(courseRepo.save).toHaveBeenCalled();
      expect(moduleRepo.save).toHaveBeenCalled();
      expect(lessonRepo.save).toHaveBeenCalled();
    });

    /**
     * Tests rejection of absolute paths in hrefs.
     * Absolute paths like /etc/passwd are forbidden in package-relative references.
     */
    it('should reject SCORM packages with absolute paths in resource href', async () => {
      const zip = new AdmZip();

      const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="course-5" version="1.0">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 3rd Edition</schemaversion>
  </metadata>
  <organizations>
    <organization identifier="org-1" title="Test Course">
      <item identifier="item-1" title="Module 1">
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="res-1" type="webcontent" href="/etc/passwd">
      <file href="/etc/passwd"/>
    </resource>
  </resources>
</manifest>`;

      zip.addFile('imsmanifest.xml', Buffer.from(manifest), '', 0);

      const zipBuffer = zip.toBuffer();

      await expect(strategy.import(zipBuffer, 'user-202')).rejects.toThrow(BadRequestException);
    });

    /**
     * Tests rejection of complex path traversal patterns that use dot segments.
     */
    it('should reject SCORM packages with complex traversal patterns (./../../ etc)', async () => {
      const zip = new AdmZip();

      const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="course-6" version="1.0">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 3rd Edition</schemaversion>
  </metadata>
  <organizations>
    <organization identifier="org-1" title="Test Course">
      <item identifier="item-1" title="Module 1">
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="res-1" type="webcontent" href="./../../config.json">
      <file href="./../../config.json"/>
    </resource>
  </resources>
</manifest>`;

      zip.addFile('imsmanifest.xml', Buffer.from(manifest), '', 0);

      const zipBuffer = zip.toBuffer();

      await expect(strategy.import(zipBuffer, 'user-303')).rejects.toThrow(BadRequestException);
    });
  });

  describe('SCORM Import - Normal Operation', () => {
    it('should handle missing imsmanifest.xml gracefully', async () => {
      const zip = new AdmZip();
      zip.addFile('content.html', Buffer.from('<html>Content</html>'), '', 0);

      const zipBuffer = zip.toBuffer();

      await expect(strategy.import(zipBuffer, 'user-invalid')).rejects.toThrow(BadRequestException);
      await expect(strategy.import(zipBuffer, 'user-invalid')).rejects.toThrow(
        /imsmanifest.xml not found/i
      );
    });

    it('should handle invalid ZIP files', async () => {
      const invalidZip = Buffer.from('this is not a valid zip file');

      await expect(strategy.import(invalidZip, 'user-invalid')).rejects.toThrow(BadRequestException);
      await expect(strategy.import(invalidZip, 'user-invalid')).rejects.toThrow(
        /Invalid ZIP\/SCORM package/i
      );
    });
  });
});
