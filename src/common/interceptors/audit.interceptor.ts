import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';

interface AuditPayload {
  adminId: string;
  adminEmail?: string;
  action: string;
  resource: string;
  resourceId?: string;
  method: string;
  path: string;
  statusCode: number;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

/** HTTP methods that represent state-changing operations worth auditing. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Paths that should never be audit-logged (internal write endpoint, health, metrics). */
const SKIP_PATH_PREFIXES = ['/internal/', '/health', '/metrics'];

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const method: string = (req.method as string).toUpperCase();

    // Only audit mutating operations from authenticated admins
    if (!MUTATING_METHODS.has(method)) {
      return next.handle();
    }

    const rawPath: string = req.originalUrl?.split('?')[0] ?? '';

    if (SKIP_PATH_PREFIXES.some((prefix) => rawPath.startsWith(prefix))) {
      return next.handle();
    }

    // Capture "before" snapshot in parallel (best-effort) so we can render field-level diffs.
    req.__auditBeforeStatePromise = this.captureBeforeState(
      req,
      method,
      rawPath,
    );

    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse();
          this.fireAuditEvent(req, res.statusCode, Date.now() - start);
        },
        error: (err: any) => {
          const statusCode: number = err?.status ?? err?.statusCode ?? 500;
          this.fireAuditEvent(req, statusCode, Date.now() - start);
        },
      }),
    );
  }

  /** Fire-and-forget — audit failures must never interrupt the main request flow. */
  private fireAuditEvent(
    req: any,
    statusCode: number,
    _duration: number,
  ): void {
    this.sendAudit(req, statusCode).catch((err) => {
      this.logger.warn(`Audit write failed: ${err?.message}`);
    });
  }

  private async sendAudit(req: any, statusCode: number): Promise<void> {
    const user = req.user as
      | { sub?: string; id?: string; email?: string }
      | undefined;

    // Skip unauthenticated requests (e.g. public endpoints that accept POST)
    if (!user) return;

    const internalSecret = this.configService.get<string>('INTERNAL_SECRET');
    if (!internalSecret) {
      this.logger.warn('INTERNAL_SECRET not set — audit logging disabled');
      return;
    }

    const authServiceUrl =
      this.configService.get<string>('AUTH_SERVICE_URL') ??
      'http://auth-service:3001';

    const rawPath: string = req.originalUrl?.split('?')[0] ?? '';
    const method: string = (req.method as string).toUpperCase();
    const { resource, action, resourceId } = this.parseRoute(method, rawPath);
    const beforeState = await this.resolveBeforeState(req);
    const metadata = this.buildMetadata({
      req,
      action,
      resourceId,
      beforeState,
    });

    const payload: AuditPayload = {
      adminId: user.sub ?? user.id ?? 'unknown',
      adminEmail: user.email,
      action,
      resource,
      resourceId,
      method,
      path: req.originalUrl ?? rawPath,
      statusCode,
      metadata,
      ip: (req.headers['x-forwarded-for'] as string) ?? req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    };

    await firstValueFrom(
      this.httpService.post(`${authServiceUrl}/internal/audit-logs`, payload, {
        headers: { 'x-internal-secret': internalSecret },
        timeout: 3000,
      }),
    );
  }

  private async captureBeforeState(
    req: any,
    method: string,
    rawPath: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      if (!['PATCH', 'PUT', 'DELETE'].includes(method)) {
        return null;
      }

      const { resource, resourceId } = this.parseRoute(method, rawPath);
      if (!resourceId) return null;

      const serviceUrl = this.resolveServiceBaseUrl(resource);
      if (!serviceUrl) return null;

      const authHeader = req.headers?.authorization as string | undefined;
      const headers: Record<string, string> = {};
      if (authHeader) headers.authorization = authHeader;

      const snapshotRes = await firstValueFrom(
        this.httpService.get(`${serviceUrl}${rawPath}`, {
          headers,
          timeout: 2000,
        }),
      );

      return this.unwrapEntity(snapshotRes.data);
    } catch {
      return null;
    }
  }

  private async resolveBeforeState(
    req: any,
  ): Promise<Record<string, unknown> | null> {
    try {
      const promise = req.__auditBeforeStatePromise as
        | Promise<Record<string, unknown> | null>
        | undefined;
      if (!promise) return null;
      return await promise;
    } catch {
      return null;
    }
  }

  private resolveServiceBaseUrl(resource: string): string | null {
    const urlMap: Record<string, string | undefined> = {
      room:
        this.configService.get<string>('ROOM_SERVICE_URL') ??
        'http://room-service:3003',
      building:
        this.configService.get<string>('BUILDING_SERVICE_URL') ??
        'http://building-service:3002',
      booking:
        this.configService.get<string>('BOOKING_SERVICE_URL') ??
        'http://booking-service:3005',
      payment:
        this.configService.get<string>('PAYMENT_SERVICE_URL') ??
        'http://payment-service:3006',
      review:
        this.configService.get<string>('REVIEW_SERVICE_URL') ??
        'http://review-service:3008',
      post:
        this.configService.get<string>('POST_SERVICE_URL') ??
        'http://post-service:3010',
      user:
        this.configService.get<string>('AUTH_SERVICE_URL') ??
        'http://auth-service:3001',
      auth:
        this.configService.get<string>('AUTH_SERVICE_URL') ??
        'http://auth-service:3001',
      chat:
        this.configService.get<string>('CHAT_SERVICE_URL') ??
        'http://chat-service:3013',
      notification:
        this.configService.get<string>('NOTIFICATION_SERVICE_URL') ??
        'http://notification-service:3007',
    };

    return urlMap[resource] ?? null;
  }

  private unwrapEntity(raw: any): Record<string, unknown> | null {
    if (!raw || typeof raw !== 'object') return null;

    // Common envelope shapes: { data: entity }, { data: { data: entity } }, entity
    const lvl1 = raw.data;
    if (lvl1 && typeof lvl1 === 'object') {
      if (lvl1.data && typeof lvl1.data === 'object') {
        return lvl1.data as Record<string, unknown>;
      }
      return lvl1 as Record<string, unknown>;
    }

    return raw as Record<string, unknown>;
  }

  private buildMetadata({
    req,
    action,
    resourceId,
    beforeState,
  }: {
    req: any;
    action: string;
    resourceId?: string;
    beforeState: Record<string, unknown> | null;
  }): Record<string, unknown> | undefined {
    const body = this.sanitizeBody(req.body);

    if (action === 'BULK_UPDATE') {
      return {
        resourceId,
        request: body,
        summary: `Bulk update with ${Array.isArray(body.ids) ? body.ids.length : 0} item(s).`,
      };
    }

    if (action !== 'UPDATE' && action !== 'CREATE' && action !== 'DELETE') {
      return body && Object.keys(body).length > 0
        ? { request: body }
        : undefined;
    }

    if (action === 'UPDATE') {
      const changes = this.computeFieldChanges(beforeState, body);
      const summary =
        changes.length > 0 ? `Updated ${changes.length} field(s)` : undefined;

      return {
        resourceId,
        request: body,
        changes,
        summary,
      };
    }

    return {
      resourceId,
      request: body,
    };
  }

  private sanitizeBody(body: any): Record<string, unknown> {
    if (!body || typeof body !== 'object') return {};
    const result: Record<string, unknown> = {};

    Object.entries(body).forEach(([key, value]) => {
      const lower = key.toLowerCase();
      if (
        ['password', 'token', 'refresh_token', 'access_token'].includes(lower)
      ) {
        result[key] = '[REDACTED]';
        return;
      }

      if (Array.isArray(value)) {
        result[key] = value.slice(0, 20);
        return;
      }

      if (typeof value === 'string' && value.length > 300) {
        result[key] = `${value.slice(0, 300)}...`;
        return;
      }

      result[key] = value;
    });

    return result;
  }

  private computeFieldChanges(
    beforeState: Record<string, unknown> | null,
    requestBody: Record<string, unknown>,
  ): FieldChange[] {
    if (!requestBody || Object.keys(requestBody).length === 0) return [];

    return Object.keys(requestBody)
      .filter((field) => !['files', 'file'].includes(field))
      .map((field) => {
        const beforeValue = this.normalizeFieldValue(
          field,
          beforeState?.[field],
        );
        const afterValue = this.normalizeFieldValue(field, requestBody[field]);
        return { field, from: beforeValue, to: afterValue };
      })
      .filter((change) => !this.isEquivalent(change.from, change.to));
  }

  private isEquivalent(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;
    return this.formatValue(a) === this.formatValue(b);
  }

  private formatValue(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.formatValue(item)).join(', ')}]`;
    }
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value as string | number | boolean);
  }

  private normalizeFieldValue(field: string, value: unknown): unknown {
    if (value === null || value === undefined) return value;

    // Amenities often come as [{id,name,...}] from DB and as ["WiFi", ...] from request.
    if (field === 'amenities') {
      return this.normalizeAmenities(value);
    }

    // For numeric-like fields, keep numbers consistent to avoid fake diffs ("10" vs 10).
    if (
      [
        'squareMeter',
        'price',
        'capacity',
        'bedCount',
        'bathroomCount',
        'floor',
        'countCapacity',
      ].includes(field)
    ) {
      const num = Number(value);
      if (!Number.isNaN(num)) return num;
    }

    if (typeof value === 'string') {
      // Attempt to parse JSON arrays encoded as strings in multipart bodies.
      const trimmed = value.trim();
      if (
        (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
        (trimmed.startsWith('{') && trimmed.endsWith('}'))
      ) {
        try {
          return JSON.parse(trimmed);
        } catch {
          return value;
        }
      }
    }

    return value;
  }

  private normalizeAmenities(value: unknown): string[] {
    let parsed: unknown = value;

    if (typeof value === 'string') {
      try {
        parsed = JSON.parse(value);
      } catch {
        return [value];
      }
    }

    if (!Array.isArray(parsed)) {
      if (
        parsed &&
        typeof parsed === 'object' &&
        'name' in (parsed as Record<string, unknown>)
      ) {
        const name = (parsed as Record<string, unknown>).name;
        return name ? [String(name as string | number | boolean)] : [];
      }
      return [];
    }

    return parsed
      .map((item) => {
        if (typeof item === 'string') return item;
        if (
          item &&
          typeof item === 'object' &&
          'name' in (item as Record<string, unknown>)
        ) {
          return String(
            ((item as Record<string, unknown>).name as
              | string
              | number
              | boolean) ?? '',
          );
        }
        return String((item as string | number | boolean) ?? '');
      })
      .filter((name) => Boolean(name))
      .sort((a, b) => a.localeCompare(b));
  }

  /**
   * Derive a human-readable (resource, action, resourceId) triple from the HTTP method + path.
   * Examples:
   *   POST   /buildings          → { resource: 'building',  action: 'CREATE',      resourceId: undefined }
   *   PATCH  /rooms/abc          → { resource: 'room',      action: 'UPDATE',      resourceId: 'abc' }
   *   PATCH  /rooms/bulk-status  → { resource: 'room',      action: 'BULK_UPDATE', resourceId: undefined }
   *   DELETE /buildings/xyz      → { resource: 'building',  action: 'DELETE',      resourceId: 'xyz' }
   *   POST   /auth/login         → { resource: 'auth',      action: 'LOGIN',       resourceId: undefined }
   */
  private parseRoute(
    method: string,
    path: string,
  ): { resource: string; action: string; resourceId: string | undefined } {
    const segments = path.split('/').filter(Boolean);
    const first = segments[0] ?? 'unknown';
    const second = segments[1];

    // Special cases first
    if (first === 'auth' || first === 'auths') {
      if (second === 'login')
        return { resource: 'auth', action: 'LOGIN', resourceId: undefined };
      if (second === 'logout')
        return { resource: 'auth', action: 'LOGOUT', resourceId: undefined };
      if (second === 'user') {
        const userId = segments[2];
        const actionMap: Record<string, string> = {
          POST: 'CREATE_USER',
          PUT: 'UPDATE_USER',
          PATCH: 'UPDATE_USER',
          DELETE: 'DELETE_USER',
        };
        return {
          resource: 'user',
          action: actionMap[method] ?? method,
          resourceId: userId,
        };
      }
    }

    if (first === 'rooms' && second === 'bulk-status') {
      return { resource: 'room', action: 'BULK_UPDATE', resourceId: undefined };
    }

    // Generic resource mapping
    const resourceMap: Record<string, string> = {
      buildings: 'building',
      rooms: 'room',
      bookings: 'booking',
      booking: 'booking',
      payments: 'payment',
      reviews: 'review',
      posts: 'post',
      'post-categories': 'post_category',
      users: 'user',
      notification: 'notification',
      notifications: 'notification',
      upload: 'upload',
      chat: 'chat',
      auth: 'auth',
      auths: 'auth',
    };

    const resource = resourceMap[first] ?? first.replace(/s$/, '');

    const actionMap: Record<string, string> = {
      POST: 'CREATE',
      PUT: 'UPDATE',
      PATCH: 'UPDATE',
      DELETE: 'DELETE',
    };

    const action = actionMap[method] ?? method;

    // resourceId: second segment if it looks like an ID (not a sub-route keyword)
    const NON_ID_SEGMENTS = new Set([
      'stats',
      'bulk-status',
      'building',
      'calendar',
      'search',
    ]);
    const resourceId =
      second && !NON_ID_SEGMENTS.has(second) ? second : undefined;

    return { resource, action, resourceId };
  }
}
