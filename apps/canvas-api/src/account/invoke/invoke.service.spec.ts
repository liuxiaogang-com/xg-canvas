import { AdapterError } from '@xgcanvas/adapters-contract';
import { ERROR_CODES } from '@xgcanvas/shared-types';

import {
  CHANNEL_A,
  CHANNEL_B,
  CREDENTIAL_A,
  CREDENTIAL_B,
  MODEL_RESOURCE_UID,
  MODEL_REVISION_ID,
  RATE_REVISION_ID,
  invokeChannel,
  invokeLogCall,
  invokeRequest,
  invokeResponse,
  makeInvokeHarness,
} from './invoke.service.spec-helpers';

describe('InvokeService request logging', () => {
  it('records an async submit as pending and returns its exact route correlation', async () => {
    const harness = makeInvokeHarness([invokeChannel(CHANNEL_A)]);
    harness.invoke.mockResolvedValue(
      invokeResponse('running', {
        external_task_id: 'vendor-task-1',
      }),
    );

    const result = await harness.service.invoke(invokeRequest());

    expect(result).toMatchObject({
      status: 'running',
      request_id: expect.any(String),
      channel_resource_uid: CHANNEL_A,
      channel_revision_id: 'aaaaaaaa-1111-4111-8111-111111111111',
      channel_route: {
        key: 'channel-a',
        base_url: 'https://vendor.example/v1',
        options: {},
      },
      credential_id: CREDENTIAL_A,
      external_task_id: 'vendor-task-1',
    });
    expect(harness.requestLog.record).toHaveBeenCalledTimes(1);
    expect(invokeLogCall(harness, 0)).toMatchObject({
      id: result.request_id,
      status: 'pending',
      model_resource_uid: MODEL_RESOURCE_UID,
      model_revision_id: MODEL_REVISION_ID,
      rate_card_revision_id: RATE_REVISION_ID,
      channel_resource_uid: CHANNEL_A,
      credential_id: CREDENTIAL_A,
      credential_label: 'credential-a',
      logical_request_id: result.request_id,
      attempt_no: 1,
    });
    expect(harness.requestLog.updatePending).toHaveBeenCalledWith(
      result.request_id,
      expect.objectContaining({ latency_ms: expect.any(Number) }),
    );
    expect(harness.requestLog.record.mock.invocationCallOrder[0]).toBeLessThan(
      harness.invoke.mock.invocationCallOrder[0],
    );
    expect(harness.registry.getSnapshot).toHaveBeenCalledTimes(1);
    expect(harness.channelResolver.listCandidates).toHaveBeenCalledWith(
      expect.any(Object),
      undefined,
      harness.snapshot,
    );
    expect(harness.adapters.get).toHaveBeenCalledWith('test-adapter');
  });

  it('records a valid adapter failed response as an error outcome', async () => {
    const harness = makeInvokeHarness([invokeChannel(CHANNEL_A)]);
    harness.invoke.mockResolvedValue(
      invokeResponse('failed', {
        error: {
          code: ERROR_CODES.VENDOR_REJECTED,
          message: 'vendor rejected the prompt',
        },
      }),
    );

    const result = await harness.service.invoke(invokeRequest());

    expect(result.status).toBe('failed');
    expect(harness.requestLog.record).toHaveBeenCalledTimes(1);
    expect(invokeLogCall(harness, 0)).toMatchObject({
      id: result.request_id,
      status: 'pending',
      channel_resource_uid: CHANNEL_A,
      credential_id: CREDENTIAL_A,
    });
    expect(harness.requestLog.finalizePending).toHaveBeenCalledWith(
      result.request_id,
      expect.objectContaining({
        status: 'error',
        error_code: ERROR_CODES.VENDOR_REJECTED,
        error_message: 'vendor rejected the prompt',
      }),
    );
  });

  it('records every real failover attempt with that attempt route and a distinct id', async () => {
    const harness = makeInvokeHarness([invokeChannel(CHANNEL_A), invokeChannel(CHANNEL_B)]);
    harness.invoke
      .mockRejectedValueOnce(
        new AdapterError({
          code: ERROR_CODES.VENDOR_UNAVAILABLE,
          message: 'first route unavailable',
          retryable: true,
        }),
      )
      .mockResolvedValueOnce(invokeResponse('succeeded', { text: 'ok' }));

    const result = await harness.service.invoke(invokeRequest());

    expect(harness.invoke).toHaveBeenCalledTimes(2);
    expect(harness.invoke.mock.calls[0][1]).toMatchObject({
      channel: { resource_uid: CHANNEL_A },
      credential: { id: CREDENTIAL_A, channel_resource_uid: CHANNEL_A },
    });
    expect(harness.invoke.mock.calls[1][1]).toMatchObject({
      channel: { resource_uid: CHANNEL_B },
      credential: { id: CREDENTIAL_B, channel_resource_uid: CHANNEL_B },
    });
    expect(harness.requestLog.record).toHaveBeenCalledTimes(2);
    expect(harness.requestLog.finalizePending).toHaveBeenCalledTimes(2);

    const firstAttempt = invokeLogCall(harness, 0);
    const secondAttempt = invokeLogCall(harness, 1);
    expect(firstAttempt).toMatchObject({
      status: 'pending',
      channel_resource_uid: CHANNEL_A,
      credential_id: CREDENTIAL_A,
      credential_label: 'credential-a',
      attempt_no: 1,
    });
    expect(secondAttempt).toMatchObject({
      id: result.request_id,
      status: 'pending',
      channel_resource_uid: CHANNEL_B,
      credential_id: CREDENTIAL_B,
      credential_label: 'credential-b',
      logical_request_id: firstAttempt.logical_request_id,
      attempt_no: 2,
    });
    expect(firstAttempt.id).toEqual(firstAttempt.logical_request_id);
    expect(firstAttempt.id).not.toBe(result.request_id);
    expect(harness.requestLog.finalizePending).toHaveBeenNthCalledWith(
      1,
      firstAttempt.id,
      expect.objectContaining({
        status: 'error',
        error_code: ERROR_CODES.VENDOR_UNAVAILABLE,
      }),
    );
    expect(harness.requestLog.finalizePending).toHaveBeenNthCalledWith(
      2,
      result.request_id,
      expect.objectContaining({ status: 'success' }),
    );
  });
});
