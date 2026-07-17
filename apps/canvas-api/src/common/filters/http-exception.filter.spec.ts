import { HttpException, Logger, type ArgumentsHost } from '@nestjs/common';
import { REDACTED_SECRET } from '@xgcanvas/model-catalog';

import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns a fixed 500 response and never logs the query or raw error', () => {
    const logger = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { host, status, json } = httpHost(
      '/api/v1/oauth/callback',
      '/api/v1/oauth/callback?code=secret',
    );

    new HttpExceptionFilter().catch(new Error('Bearer top-secret'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: 'internal error', request_id: 'http-request-id' },
    });
    expect(logger).toHaveBeenCalledWith('GET /api/v1/oauth/callback -> 500 [req http-request-id]');
    expect(JSON.stringify(logger.mock.calls)).not.toContain('secret');
  });

  it('redacts secret-bearing exception messages and details', () => {
    const { host, json } = httpHost('/api/v1/test', '/api/v1/test');
    const error = new HttpException(
      {
        code: 'VALIDATION_FAILED',
        message: 'Authorization: Bearer top-secret',
        details: { url: 'https://vendor.example/callback?X-Amz-Signature=top-secret' },
      },
      400,
    );

    new HttpExceptionFilter().catch(error, host);

    const body = json.mock.calls[0][0] as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toContain('top-secret');
    expect(JSON.stringify(body)).toContain(REDACTED_SECRET);
  });
});

function httpHost(path: string, url: string) {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const response = { status, json };
  const request = { method: 'GET', path, url, id: 'http-request-id' };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}
