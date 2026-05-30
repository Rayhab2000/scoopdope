import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const method = request.method;
    const route = request.route?.path || request.url;
    const startTime = Date.now();

    return next.handle().pipe(
      tap(() => {
        const statusCode = response.statusCode;
        const durationSeconds = (Date.now() - startTime) / 1000;

        this.metricsService.incrementHttpRequests(method, route, statusCode);
        this.metricsService.observeHttpRequestDuration(method, route, statusCode, durationSeconds);
      }),
    );
  }
}
