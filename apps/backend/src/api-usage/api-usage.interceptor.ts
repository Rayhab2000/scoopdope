import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

interface ApiUsageRequest {
  route?: { path?: string };
  url?: string;
  method?: string;
  user?: { id?: string };
  ip?: string;
  headers?: Record<string, string | undefined>;
}
import { ApiUsageService } from './api-usage.service';

@Injectable()
export class ApiUsageInterceptor implements NestInterceptor {
  constructor(private readonly apiUsageService: ApiUsageService) {}

  intercept<T>(context: ExecutionContext, next: CallHandler<T>): Observable<T> {
    const req = context.switchToHttp().getRequest();
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.record(context, req, start),
        error: () => this.record(context, req, start),
      }),
    );
  }

  private record(context: ExecutionContext, req: ApiUsageRequest, start: number): void {
    const res = context.switchToHttp().getResponse();
    const responseTimeMs = Date.now() - start;

    this.apiUsageService
      .log({
        endpoint: req.route?.path ?? req.url,
        method: req.method,
        userId: req.user?.id ?? undefined,
        ip: req.ip ?? undefined,
        statusCode: res.statusCode,
        responseTimeMs,
        userAgent: req.headers?.['user-agent'] ?? undefined,
      })
      .catch(() => {}); // fire-and-forget, never block the response
  }
}
