import { describe, expect, it } from 'vitest';
import { axiosError } from '../test/axios';
import { errorOf, toAppError } from './errors';

describe('toAppError', () => {
  it('keeps the structured API error, field details and request id', () => {
    const error = toAppError(
      axiosError(422, {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Check the highlighted fields.',
          details: [{ field: 'email', message: 'Enter a valid email' }],
          meta: {},
          requestId: 'req-1',
        },
      }),
    );
    expect(error).toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      message: 'Check the highlighted fields.',
      details: [{ field: 'email', message: 'Enter a valid email' }],
      requestId: 'req-1',
    });
  });

  it('turns an unexpected body into a generic server error', () => {
    const error = toAppError(axiosError(502, '<html>Bad gateway</html>'));
    expect(error).toMatchObject({ status: 502, code: 'INTERNAL_ERROR' });
    expect(error.message).not.toContain('html');
  });

  it('reports timeouts and unreachable servers separately', () => {
    expect(toAppError(axiosError(0, undefined, 'ECONNABORTED')).code).toBe('TIMEOUT');
    expect(toAppError(axiosError(0, undefined)).code).toBe('NETWORK_ERROR');
  });

  it('wraps plain errors', () => {
    expect(toAppError(new Error('boom'))).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'boom',
    });
  });
});

describe('errorOf', () => {
  it('passes app errors through and ignores empty values', () => {
    const appError = toAppError(new Error('x'));
    expect(errorOf(appError)).toBe(appError);
    expect(errorOf(undefined)).toBeNull();
  });
});
