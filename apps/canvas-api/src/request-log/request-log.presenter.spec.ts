import { REDACTED_SECRET } from '@xgcanvas/model-catalog';
import type { RequestLog } from './request-log.entity';
import { presentRequestLog } from './request-log.presenter';

describe('presentRequestLog', () => {
  it('deep-redacts legacy secret-bearing JSON and route URLs', () => {
    const view = presentRequestLog({
      channel_route: {
        key: 'legacy',
        base_url: 'https://user:password@gateway.example/v1?api_key=secret&v=1',
        options: { headers: { Authorization: 'Bearer secret', trace_id: 'trace' } },
      },
      request_summary: { nested: { refresh_token: 'secret' } },
      usage: { input_tokens: 10 },
      vendor_error: { request: { cookie: 'secret' } },
      request_body: { auth: { value: 'secret' } },
      response_body: { result: 'ok' },
      error_message: 'Authorization: Bearer secret',
    } as unknown as RequestLog);

    expect(view.channel_route?.options).toEqual({
      headers: { Authorization: REDACTED_SECRET, trace_id: 'trace' },
    });
    expect(view.request_summary).toEqual({ nested: { refresh_token: REDACTED_SECRET } });
    expect(view.vendor_error).toEqual({ request: { cookie: REDACTED_SECRET } });
    expect(view.request_body).toEqual({ auth: REDACTED_SECRET });
    expect(view.error_message).toBe(`Authorization: ${REDACTED_SECRET}`);
    expect(JSON.stringify(view)).not.toContain('Bearer secret');
    expect(JSON.stringify(view)).not.toContain('user:password');
    expect(JSON.stringify(view)).not.toContain('api_key=secret');
  });
});
