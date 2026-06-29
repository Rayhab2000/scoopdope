import { BadRequestException, Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import * as path from 'path';
import * as AdmZip from 'adm-zip';
import { parseStringPromise } from 'xml2js';
import { Course } from '../../courses/course.entity';
import { CourseModule } from '../../courses/course-module.entity';
import { Lesson } from '../../courses/lesson.entity';
import { CourseJsonExport, CourseJsonModule } from '../import-export.types';
import { ImportStrategy } from './import-strategy.interface';

@Injectable()
export class ScormImportStrategy implements ImportStrategy {
  constructor(
    private readonly courseRepo: Repository<Course>,
    private readonly moduleRepo: Repository<CourseModule>,
    private readonly lessonRepo: Repository<Lesson>
  ) {}

  canHandle(mimeType: string): boolean {
    return mimeType === 'application/zip' || mimeType === 'application/x-zip-compressed' || mimeType.endsWith('.zip');
  }

  async import(file: Buffer, userId: string): Promise<{ courseId: string }> {
    let zip: AdmZip;
    try {
      zip = new AdmZip(file);
    } catch {
      throw new BadRequestException('Invalid ZIP/SCORM package');
    }

    const manifestEntry =
      zip.getEntry('imsmanifest.xml') ??
      zip.getEntries().find((e) => e.entryName.endsWith('imsmanifest.xml'));

    if (!manifestEntry) throw new BadRequestException('imsmanifest.xml not found in package');

    const xml = manifestEntry.getData().toString('utf-8');
    const manifest = await parseStringPromise(xml, { explicitArray: false });

    const payload = this.parseScormManifest(manifest, zip);
    const course = await this.courseRepo.save(
      this.courseRepo.create({
        title: payload.course.title,
        description: payload.course.description,
        level: payload.course.level,
        durationHours: payload.course.durationHours,
        requiresKyc: payload.course.requiresKyc ?? false,
        instructorId: userId,
        isPublished: false,
      })
    );

    for (const mod of payload.course.modules ?? []) {
      const savedModule = await this.moduleRepo.save(
        this.moduleRepo.create({ courseId: course.id, title: mod.title, order: mod.order })
      );
      for (const lesson of mod.lessons ?? []) {
        await this.lessonRepo.save(
          this.lessonRepo.create({
            moduleId: savedModule.id,
            title: lesson.title,
            content: lesson.content,
            videoUrl: lesson.videoUrl ?? undefined,
            order: lesson.order,
            durationMinutes: lesson.durationMinutes,
          })
        );
      }
    }

    return { courseId: course.id };
  }

  private parseScormManifest(manifest: Record<string, unknown>, zip: AdmZip): CourseJsonExport {
    const root = manifest['manifest'] as Record<string, unknown>;
    const metadata = root?.['metadata'] as Record<string, unknown> | undefined;
    const organizations = root?.['organizations'] as Record<string, unknown> | undefined;
    const resources = root?.['resources'] as Record<string, unknown> | undefined;

    const title =
      (metadata?.['schema'] as string) ??
      this.extractScormTitle(organizations) ??
      'Imported SCORM Course';

    const orgList = organizations?.['organization'];
    const org = Array.isArray(orgList) ? orgList[0] : orgList ?? {};
    const orgTitle = (org as Record<string, unknown>)?.['title'] as string | undefined;

    const items = (org as Record<string, unknown>)?.['item'];
    const itemList: Record<string, unknown>[] = Array.isArray(items)
      ? items
      : items
      ? [items as Record<string, unknown>]
      : [];

    const resourceMap = this.buildResourceMap(resources, zip);

    const modules: CourseJsonModule[] = itemList.map((item, idx) => {
      const itemTitle = (item['title'] as string) ?? `Module ${idx + 1}`;
      const subItems = item['item'];
      const subList: Record<string, unknown>[] = Array.isArray(subItems)
        ? subItems
        : subItems
        ? [subItems as Record<string, unknown>]
        : [];

      const lessons = subList.length
        ? subList.map((sub, li) => ({
            title: (sub['title'] as string) ?? `Lesson ${li + 1}`,
            content: resourceMap[(sub['$'] as Record<string, string>)?.identifierref ?? ''] ?? '',
            order: li,
            durationMinutes: 0,
          }))
        : [
            {
              title: itemTitle,
              content: resourceMap[(item['$'] as Record<string, string>)?.identifierref ?? ''] ?? '',
              order: 0,
              durationMinutes: 0,
            },
          ];

      return { title: itemTitle, order: idx, lessons };
    });

    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      course: {
        title: orgTitle ?? title,
        description: 'Imported from SCORM package',
        level: 'beginner',
        durationHours: 0,
        requiresKyc: false,
        modules,
      },
    };
  }

  private extractScormTitle(organizations: Record<string, unknown> | undefined): string | undefined {
    const org = organizations?.['organization'];
    const first = Array.isArray(org) ? org[0] : org;
    return (first as Record<string, unknown>)?.['title'] as string | undefined;
  }

  /**
   * Validates that a resolved path remains within the extraction root.
   * Prevents path traversal attacks like ../../../../etc/passwd.
   *
   * @param resolvedPath The absolute resolved path after normalization
   * @param extractionRoot The root directory where extraction should be confined
   * @throws BadRequestException if path escapes the extraction root
   */
  private validatePathTraversal(resolvedPath: string, extractionRoot: string): void {
    // Ensure both paths use consistent separators and are absolute
    const normalized = path.resolve(resolvedPath);
    const rootNormalized = path.resolve(extractionRoot);

    // Check if the resolved path is a strict child of the extraction root
    if (!normalized.startsWith(rootNormalized + path.sep) && normalized !== rootNormalized) {
      throw new BadRequestException(
        'Invalid path in SCORM package: path traversal detected. Entry paths must remain within package bounds.'
      );
    }
  }

  private buildResourceMap(resources: Record<string, unknown> | undefined, zip: AdmZip): Record<string, string> {
    const map: Record<string, string> = {};
    if (!resources) return map;

    // Use a consistent extraction root for validation
    const extractionRoot = '/scorm-package';

    const resList = resources['resource'];
    const list: Record<string, unknown>[] = Array.isArray(resList)
      ? resList
      : resList
      ? [resList as Record<string, unknown>]
      : [];

    for (const res of list) {
      const attrs = res['$'] as Record<string, string> | undefined;
      const id = attrs?.['identifier'];
      const href = attrs?.['href'];
      if (!id || !href) continue;

      // Validate that the href doesn't escape the package root
      const resolvedPath = path.resolve(extractionRoot, href);
      this.validatePathTraversal(resolvedPath, extractionRoot);

      const entry = zip.getEntry(href) ?? zip.getEntries().find((e) => e.entryName.endsWith(href));
      if (entry) {
        map[id] = entry.getData().toString('utf-8');
      }
    }
    return map;
  }
}
