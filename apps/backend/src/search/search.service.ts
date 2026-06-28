import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ElasticsearchService } from '@nestjs/elasticsearch';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchAnalytic } from './search-analytic.entity';
import { Course } from '../courses/course.entity';
import { Lesson } from '../courses/lesson.entity';
import { Post } from '../forums/post.entity';

export type IndexName = 'courses' | 'lessons' | 'posts';

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private readonly es: ElasticsearchService,
    @InjectRepository(SearchAnalytic)
    private readonly analyticsRepo: Repository<SearchAnalytic>
  ) {}

  async onModuleInit() {
    await this.ensureIndices();
  }

  // ─── Index management ──────────────────────────────────────────────────────

  private async ensureIndices() {
    const indices: Record<IndexName, object> = {
      courses: {
        mappings: {
          properties: {
            title: { type: 'text', analyzer: 'standard', copy_to: 'suggest' },
            description: { type: 'text', analyzer: 'standard' },
            level: { type: 'keyword' },
            language: { type: 'keyword' },
            durationHours: { type: 'float' },
            isPublished: { type: 'boolean' },
            suggest: { type: 'completion' },
          },
        },
      },
      lessons: {
        mappings: {
          properties: {
            title: { type: 'text', analyzer: 'standard', copy_to: 'suggest' },
            content: { type: 'text', analyzer: 'standard' },
            moduleId: { type: 'keyword' },
            durationMinutes: { type: 'integer' },
            suggest: { type: 'completion' },
          },
        },
      },
      posts: {
        mappings: {
          properties: {
            title: { type: 'text', analyzer: 'standard', copy_to: 'suggest' },
            content: { type: 'text', analyzer: 'standard' },
            courseId: { type: 'keyword' },
            userId: { type: 'keyword' },
            suggest: { type: 'completion' },
          },
        },
      },
    };

    for (const [index, body] of Object.entries(indices)) {
      try {
        const exists = await this.es.indices.exists({ index });
        if (!exists) {
          await this.es.indices.create({ index, ...body });
          this.logger.log(`Created ES index: ${index}`);
        }
      } catch (err) {
        this.logger.warn(`Failed to ensure index ${index}: ${err}`);
      }
    }
  }

  // ─── Indexing ──────────────────────────────────────────────────────────────

  async indexCourse(course: Course) {
    await this.es.index({
      index: 'courses',
      id: course.id,
      document: {
        title: course.title,
        description: course.description,
        level: course.level,
        language: course.language,
        durationHours: course.durationHours,
        isPublished: course.isPublished,
        suggest: { input: [course.title] },
      },
    });
  }

  async indexLesson(lesson: Lesson) {
    await this.es.index({
      index: 'lessons',
      id: lesson.id,
      document: {
        title: lesson.title,
        content: lesson.content,
        moduleId: lesson.moduleId,
        durationMinutes: lesson.durationMinutes,
        suggest: { input: [lesson.title] },
      },
    });
  }

  async indexPost(post: Post) {
    await this.es.index({
      index: 'posts',
      id: post.id,
      document: {
        title: post.title,
        content: post.content,
        courseId: post.courseId,
        userId: post.userId,
        suggest: { input: [post.title] },
      },
    });
  }

  async deleteFromIndex(index: IndexName, id: string) {
    try {
      await this.es.delete({ index, id });
    } catch {
      // ignore 404 — document may not have been indexed
    }
  }

  // ─── Search ────────────────────────────────────────────────────────────────

  async search(
    query: string,
    indices: IndexName[] = ['courses', 'lessons', 'posts'],
    userId?: string
  ) {
    const response = await this.es.search({
      index: indices.join(','),
      query: {
        multi_match: {
          query,
          fields: ['title^3', 'description^2', 'content'],
          fuzziness: 'AUTO',
          prefix_length: 1,
        },
      },
      highlight: {
        fields: { title: {}, description: {}, content: {} },
      },
      size: 20,
    });

    const hits = response.hits.hits.map((hit) => ({
      id: hit._id,
      type: hit._index,
      score: hit._score,
      ...hit._source as object,
      highlight: hit.highlight,
    }));

    await this.trackAnalytic(query, hits.length, userId);
    return { total: response.hits.total, hits };
  }

  // ─── Autocomplete ──────────────────────────────────────────────────────────

  async autocomplete(prefix: string, indices: IndexName[] = ['courses', 'lessons', 'posts']) {
    const response = await this.es.search({
      index: indices.join(','),
      suggest: {
        suggestions: {
          prefix,
          completion: { field: 'suggest', size: 5, skip_duplicates: true, fuzzy: { fuzziness: 1 } },
        },
      },
      _source: ['title'],
      size: 0,
    });

    interface ElasticsearchSuggestionOption {
      text: string;
      _index: string;
      _id: string;
    }

    interface ElasticsearchSuggestion {
      options?: ElasticsearchSuggestionOption[];
    }

    const suggestions =
      (response.suggest?.['suggestions'] as ElasticsearchSuggestion[] | undefined)?.flatMap((s) =>
        (s.options ?? []).map((o) => ({ text: o.text, index: o._index, id: o._id }))
      ) ?? [];

    return suggestions;
  }

  // ─── Analytics ─────────────────────────────────────────────────────────────

  private async trackAnalytic(query: string, resultsCount: number, userId?: string) {
    try {
      await this.analyticsRepo.save(
        this.analyticsRepo.create({ query, resultsCount, userId: userId ?? null })
      );
    } catch {
      // non-critical
    }
  }

  async trackClick(query: string, resultId: string, resultType: string, userId?: string) {
    await this.analyticsRepo.save(
      this.analyticsRepo.create({
        query,
        resultsCount: 0,
        clickedResultId: resultId,
        clickedResultType: resultType,
        userId: userId ?? null,
      })
    );
  }

  async getTopQueries(limit = 10) {
    return this.analyticsRepo
      .createQueryBuilder('a')
      .select('a.query', 'query')
      .addSelect('COUNT(*)', 'count')
      .groupBy('a.query')
      .orderBy('count', 'DESC')
      .limit(limit)
      .getRawMany();
  }
}
