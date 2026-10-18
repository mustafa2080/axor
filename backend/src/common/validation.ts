import type { z } from 'zod';
import { AppError } from './errors.js';

export interface ValidationIssue {
  path: string;
  message: string;
}

/**
 * Validates untrusted input (body, query, params) against a Zod schema and returns the typed,
 * parsed value. Throws a 400 VALIDATION_ERROR listing only field paths and messages (never the
 * submitted values). Server-side validation is mandatory even if the frontend validates too.
 */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues: ValidationIssue[] = result.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    }));
    throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', issues);
  }
  return result.data;
}
