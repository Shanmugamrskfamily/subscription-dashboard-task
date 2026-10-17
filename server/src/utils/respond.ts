import type { Response } from 'express';
import type { ApiSuccess, PageMeta } from '@planpilot/shared';

export function ok<T>(res: Response, data: T, status = 200, meta?: PageMeta): Response {
  const body: ApiSuccess<T> = meta ? { success: true, data, meta } : { success: true, data };
  return res.status(status).json(body);
}

export function pageMeta(page: number, pageSize: number, total: number): PageMeta {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
