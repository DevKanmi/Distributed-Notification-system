// import {
//   Injectable,
//   NestInterceptor,
//   ExecutionContext,
//   CallHandler,
// } from '@nestjs/common';
// import { map } from 'rxjs/operators';
// import { Observable } from 'rxjs';

// // Helper to recursively convert object keys to snake_case
// function toSnakeCase(obj: any): any {
//   if (obj instanceof Date) return obj; // ✅ Don't convert Date objects
//   if (Array.isArray(obj)) {
//     return obj.map(toSnakeCase);
//   } else if (obj && typeof obj === 'object') {
//     return Object.keys(obj).reduce((acc, key) => {
//       if (key === 'password') return acc; // exclude password
//       const newKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
//       acc[newKey] = toSnakeCase(obj[key]);
//       return acc;
//     }, {} as Record<string, any>);
//   }
//   return obj;
// }

// @Injectable()
// export class TransformResponseInterceptor implements NestInterceptor {
//   intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
//     return next.handle().pipe(map(data => toSnakeCase(data)));
//   }
// }

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';

/**
 * Recursively converts object keys from camelCase to snake_case.
 * - Skips Date objects.
 * - Skips password fields.
 */
function toSnakeCase(obj: any): any {
  if (obj instanceof Date) {
    return obj; // ✅ Keep Date objects as-is
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => toSnakeCase(item));
  }

  if (obj && typeof obj === 'object' && !(obj instanceof Buffer)) {
    return Object.keys(obj).reduce((acc, key) => {
      // ✅ Exclude password fields from output
      if (key.toLowerCase() === 'password') return acc;

      // ✅ Convert to snake_case safely
      const newKey = key
        .replace(/([A-Z])/g, '_$1')
        .toLowerCase()
        .replace(/^_/, ''); // Avoid leading underscore if key starts with capital

      acc[newKey] = toSnakeCase(obj[key]);
      return acc;
    }, {} as Record<string, any>);
  }

  return obj;
}

@Injectable()
export class TransformResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        try {
          return toSnakeCase(data);
        } catch (error) {
          // ✅ Fail-safe: if conversion breaks, just return original data
          console.error('Error in TransformResponseInterceptor:', error);
          return data;
        }
      }),
    );
  }
}

