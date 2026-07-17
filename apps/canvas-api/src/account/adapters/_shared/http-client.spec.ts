import { AdapterError } from '@xgcanvas/adapters-contract';
import { ERROR_CODES } from '@xgcanvas/shared-types';

jest.mock('../../../common/http/guarded-outbound', () => ({
  guardedFetch: (input: string | URL, init?: RequestInit) => globalThis.fetch(input, init),
}));

import { httpJson } from './http-client';

describe('httpJson dispatch safety', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('does not retry a default POST after a network failure', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('socket closed'));

    const error = await httpJson({
      url: 'https://vendor.example/jobs',
      method: 'POST',
      body: { prompt: 'hello' },
    }).catch((caught: unknown) => caught as AdapterError);

    expect(error).toMatchObject({
      code: ERROR_CODES.VENDOR_UNAVAILABLE,
      retryable: true,
      dispatch_outcome: 'outcome_unknown',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not retry a default POST after its timeout fires', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const abort = () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          };
          if (init?.signal?.aborted) abort();
          else init?.signal?.addEventListener('abort', abort, { once: true });
        }),
    );

    const error = await httpJson({
      url: 'https://vendor.example/jobs',
      method: 'POST',
      timeoutMs: 5,
    }).catch((caught: unknown) => caught as AdapterError);

    expect(error).toMatchObject({
      code: ERROR_CODES.VENDOR_TIMEOUT,
      retryable: true,
      dispatch_outcome: 'outcome_unknown',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not retry a default POST after a vendor 5xx response', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(503, { message: 'temporarily unavailable' }));

    const error = await httpJson({
      url: 'https://vendor.example/jobs',
      method: 'POST',
    }).catch((caught: unknown) => caught as AdapterError);

    expect(error).toMatchObject({
      code: ERROR_CODES.VENDOR_UNAVAILABLE,
      retryable: true,
      httpStatus: 503,
      dispatch_outcome: 'outcome_unknown',
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('retries GET by default because replay is safe', async () => {
    jest.useFakeTimers();
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(503, { message: 'try again' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const pending = httpJson<{ ok: boolean }>({
      url: 'https://vendor.example/jobs/job-1',
      method: 'GET',
    });
    await jest.runAllTimersAsync();

    await expect(pending).resolves.toMatchObject({ data: { ok: true } });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('allows an explicitly safe POST to retry with a definite replay outcome', async () => {
    jest.useFakeTimers();
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('connection reset'));

    const pending = httpJson({
      url: 'https://vendor.example/idempotent-action',
      method: 'POST',
      retry: 'safe',
    });
    const assertion = expect(pending).rejects.toMatchObject({
      code: ERROR_CODES.VENDOR_UNAVAILABLE,
      retryable: true,
      dispatch_outcome: 'definitely_rejected',
    });
    await jest.runAllTimersAsync();

    await assertion;
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
