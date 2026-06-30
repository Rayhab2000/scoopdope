import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/**
 * Guard that blocks access in production environments.
 *
 * Migration endpoints are operational/maintenance tools that should only be
 * reachable from non-production environments. Running or reverting migrations
 * via an HTTP endpoint in production carries a high risk of data loss and
 * should be performed through dedicated CLI tooling with appropriate change
 * management controls instead.
 */
@Injectable()
export class NonProductionGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException(
        'Migration endpoints are disabled in production. Use the CLI to manage migrations.',
      );
    }
    return true;
  }
}
