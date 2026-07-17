import { AdapterError } from '@xgcanvas/adapters-contract';
import { ERROR_CODES } from '@xgcanvas/shared-types';

import {
  CHANNEL_A,
  CHANNEL_B,
  invokeChannel,
  invokeLogCall,
  invokeRequest,
  invokeResponse,
  makeInvokeHarness,
} from './invoke.service.spec-helpers';

describe('InvokeService dispatch safety', () => {
  it('keeps an outcome-unknown attempt pending and never fails over', async () => {
    const harness = makeInvokeHarness([invokeChannel(CHANNEL_A), invokeChannel(CHANNEL_B)]);
    harness.invoke.mockRejectedValueOnce(
      new AdapterError({
        code: ERROR_CODES.VENDOR_UNAVAILABLE,
        message: 'connection dropped after dispatch',
        retryable: true,
        dispatch_outcome: 'outcome_unknown',
      }),
    );

    const error = await harness.service
      .invoke(invokeRequest())
      .catch((caught: unknown) => caught as AdapterError & { request_id?: string });
    const attempt = invokeLogCall(harness, 0);

    expect(error).toMatchObject({
      code: ERROR_CODES.VENDOR_UNAVAILABLE,
      dispatch_outcome: 'outcome_unknown',
      request_id: attempt.id,
    });
    expect(harness.invoke).toHaveBeenCalledTimes(1);
    expect(harness.requestLog.record).toHaveBeenCalledTimes(1);
    expect(harness.requestLog.updatePending).toHaveBeenCalledWith(
      attempt.id,
      expect.objectContaining({
        error_code: ERROR_CODES.VENDOR_UNAVAILABLE,
        error_message: 'connection dropped after dispatch',
      }),
    );
    expect(harness.requestLog.finalizePending).not.toHaveBeenCalled();
    expect(harness.registry.getSnapshot).toHaveBeenCalledTimes(1);
  });

  it('settles a vendor-completed ingestion failure with usage and never fails over', async () => {
    const harness = makeInvokeHarness([invokeChannel(CHANNEL_A), invokeChannel(CHANNEL_B)]);
    harness.invoke.mockRejectedValueOnce(
      new AdapterError({
        code: ERROR_CODES.ASSET_DOWNLOAD_FAILED,
        message: 'vendor completed but S3 ingestion failed',
        dispatch_outcome: 'accepted',
        accepted_result: {
          usage: { image_count: 1 },
          vendor_request_id: 'vendor-request-1',
        },
      }),
    );

    const error = await harness.service
      .invoke(invokeRequest())
      .catch((caught: unknown) => caught as AdapterError & { request_id?: string });
    const attempt = invokeLogCall(harness, 0);

    expect(error).toMatchObject({
      code: ERROR_CODES.ASSET_DOWNLOAD_FAILED,
      dispatch_outcome: 'accepted',
      request_id: attempt.id,
    });
    expect(harness.invoke).toHaveBeenCalledTimes(1);
    expect(harness.requestLog.record).toHaveBeenCalledTimes(1);
    expect(harness.requestLog.updatePending).not.toHaveBeenCalled();
    expect(harness.requestLog.finalizePending).toHaveBeenCalledWith(
      attempt.id,
      expect.objectContaining({
        status: 'success',
        usage: { image_count: 1 },
        error_code: ERROR_CODES.ASSET_DOWNLOAD_FAILED,
        response_body: expect.objectContaining({
          vendor_completed: true,
          asset_ingestion: 'failed',
        }),
      }),
    );
  });

  it('cancels an accepted vendor job if its ledger update fails and never fails over', async () => {
    const harness = makeInvokeHarness([invokeChannel(CHANNEL_A), invokeChannel(CHANNEL_B)]);
    harness.invoke.mockResolvedValueOnce(
      invokeResponse('running', {
        external_task_id: 'vendor-task-accepted',
      }),
    );
    harness.requestLog.updatePending.mockResolvedValueOnce(false);

    const error = await harness.service
      .invoke(invokeRequest())
      .catch((caught: unknown) => caught as AdapterError & { request_id?: string });
    const invokeCtx = harness.invoke.mock.calls[0][1];

    expect(error).toMatchObject({
      code: ERROR_CODES.ADAPTER_INTERNAL,
      dispatch_outcome: 'accepted',
      request_id: invokeLogCall(harness, 0).id,
    });
    expect(harness.invoke).toHaveBeenCalledTimes(1);
    expect(harness.cancel).toHaveBeenCalledTimes(1);
    expect(harness.cancel).toHaveBeenCalledWith('vendor-task-accepted', invokeCtx);
    expect(harness.cancel.mock.calls[0][1]).toBe(invokeCtx);
    expect(harness.requestLog.record).toHaveBeenCalledTimes(1);
    expect(harness.requestLog.finalizePending).not.toHaveBeenCalled();
  });

  it('does not call the vendor when opening the attempt ledger fails', async () => {
    const harness = makeInvokeHarness([invokeChannel(CHANNEL_A), invokeChannel(CHANNEL_B)]);
    harness.requestLog.record.mockRejectedValueOnce(new Error('database unavailable'));

    const error = await harness.service
      .invoke(invokeRequest())
      .catch((caught: unknown) => caught as AdapterError & { request_id?: string });

    expect(error).toMatchObject({
      code: ERROR_CODES.ADAPTER_INTERNAL,
      dispatch_outcome: 'definitely_rejected',
      request_id: expect.any(String),
    });
    expect(harness.invoke).not.toHaveBeenCalled();
    expect(harness.requestLog.record).toHaveBeenCalledTimes(1);
    expect(harness.requestLog.updatePending).not.toHaveBeenCalled();
    expect(harness.requestLog.finalizePending).not.toHaveBeenCalled();
  });

  it('keeps an unknown streaming dispatch pending instead of finalizing it', async () => {
    const harness = makeInvokeHarness([invokeChannel(CHANNEL_A)]);
    harness.stream.mockImplementation(async function* streamWithUnknownOutcome() {
      throw new AdapterError({
        code: ERROR_CODES.VENDOR_UNAVAILABLE,
        message: 'stream connection lost',
        retryable: true,
        dispatch_outcome: 'outcome_unknown',
      });
    });

    const events = [];
    for await (const event of harness.service.stream(invokeRequest())) events.push(event);
    const attempt = invokeLogCall(harness, 0);

    expect(events).toEqual([
      { type: 'meta', request_id: attempt.id },
      {
        type: 'error',
        request_id: attempt.id,
        code: ERROR_CODES.VENDOR_UNAVAILABLE,
        message: 'stream connection lost',
      },
    ]);
    expect(harness.stream).toHaveBeenCalledTimes(1);
    expect(harness.requestLog.updatePending).toHaveBeenCalledWith(
      attempt.id,
      expect.objectContaining({
        error_code: ERROR_CODES.VENDOR_UNAVAILABLE,
        error_message: 'stream connection lost',
      }),
    );
    expect(harness.requestLog.finalizePending).not.toHaveBeenCalled();
    expect(harness.registry.getSnapshot).toHaveBeenCalledTimes(1);
    expect(harness.channelResolver.select).toHaveBeenCalledWith(
      expect.any(Object),
      undefined,
      harness.snapshot,
    );
  });
});
