import { Injectable } from '@nestjs/common';
import type { AdapterError, UnifiedRequest, UnifiedResponse } from '@xgcanvas/adapters-contract';

import { RequestLogService } from '../../request-log/request-log.service';
import { billableUsage, type InvokeLogDimensions } from './invoke-log-context';

/** Durable ledger boundary for one real adapter invocation attempt. */
@Injectable()
export class InvokeAttemptLogService {
  constructor(private readonly logs: RequestLogService) {}

  nextAttemptNo(logicalRequestId: string): Promise<number> {
    return this.logs.nextAttemptNo(logicalRequestId);
  }

  /** Must succeed before the adapter is called; an unlogged vendor call is forbidden. */
  async begin(
    requestId: string,
    logicalRequestId: string,
    attemptNo: number,
    dimensions: InvokeLogDimensions,
  ): Promise<void> {
    await this.logs.record({
      ...dimensions,
      id: requestId,
      logical_request_id: logicalRequestId,
      attempt_no: attemptNo,
      status: 'pending',
    });
  }

  async finish(
    requestId: string,
    startedAt: number,
    request: UnifiedRequest,
    response: UnifiedResponse,
  ): Promise<void> {
    const common = {
      latency_ms: Date.now() - startedAt,
      usage: billableUsage(request, response),
      response_body: {
        text: response.text ?? '',
        external_task_id: response.external_task_id ?? null,
      },
    };
    const updated =
      response.status === 'running'
        ? await this.logs.updatePending(requestId, common)
        : await this.logs.finalizePending(requestId, {
            ...common,
            status: response.status === 'succeeded' ? 'success' : 'error',
            error_code: response.error?.code ?? null,
            error_message: response.error?.message ?? null,
          });
    assertUpdated(requestId, updated);
  }

  async fail(requestId: string, startedAt: number, error: AdapterError): Promise<void> {
    const updated = await this.logs.finalizePending(requestId, {
      status: 'error',
      http_status: error.httpStatus ?? null,
      latency_ms: Date.now() - startedAt,
      error_code: error.code,
      error_message: error.message,
      vendor_error: error.vendor ?? null,
    });
    assertUpdated(requestId, updated);
  }

  /** Vendor completed synchronously, but downloading/persisting its assets failed locally. */
  async finishAcceptedResultFailure(
    requestId: string,
    startedAt: number,
    error: AdapterError,
  ): Promise<void> {
    const accepted = error.accepted_result;
    if (!accepted) throw new Error(`accepted vendor result is missing: ${requestId}`);
    const updated = await this.logs.finalizePending(requestId, {
      status: 'success',
      usage: accepted.usage ? { ...accepted.usage } : null,
      http_status: error.httpStatus ?? null,
      latency_ms: Date.now() - startedAt,
      error_code: error.code,
      error_message: error.message,
      vendor_error: error.vendor ?? null,
      response_body: {
        vendor_completed: true,
        asset_ingestion: 'failed',
        vendor_request_id: accepted.vendor_request_id ?? null,
      },
    });
    assertUpdated(requestId, updated);
  }

  /** Outcome may have reached the vendor; keep the row pending and forbid replay. */
  async markOutcomeUnknown(
    requestId: string,
    startedAt: number,
    error: AdapterError,
  ): Promise<void> {
    const updated = await this.logs.updatePending(requestId, {
      http_status: error.httpStatus ?? null,
      latency_ms: Date.now() - startedAt,
      error_code: error.code,
      error_message: error.message,
      vendor_error: error.vendor ?? null,
    });
    assertUpdated(requestId, updated);
  }

  /** Registry/validation failures have no vendor attempt, so persistence stays best-effort. */
  async recordPreflightFailure(
    requestId: string,
    logicalRequestId: string,
    dimensions: InvokeLogDimensions,
    startedAt: number,
    error: AdapterError,
  ): Promise<void> {
    await this.logs
      .record({
        ...dimensions,
        id: requestId,
        logical_request_id: logicalRequestId,
        attempt_no: null,
        status: 'error',
        http_status: error.httpStatus ?? null,
        latency_ms: Date.now() - startedAt,
        error_code: error.code,
        error_message: error.message,
        vendor_error: error.vendor ?? null,
      })
      .catch(() => undefined);
  }
}

function assertUpdated(requestId: string, updated: boolean): void {
  if (!updated) throw new Error(`pending request log is missing: ${requestId}`);
}
