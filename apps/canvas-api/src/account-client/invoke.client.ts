import { Injectable } from '@nestjs/common';

import { CancelService } from '../account/invoke/cancel.service';
import { InvokeService, type InvokeStreamEvent } from '../account/invoke/invoke.service';
import { PollService } from '../account/invoke/poll.service';
import type { CancelRequestDto } from '../account/invoke/dto/cancel-request.dto';
import type { InvokeRequestDto } from '../account/invoke/dto/invoke-request.dto';
import type { PollRequestDto } from '../account/invoke/dto/poll-request.dto';
import type { CancelRequest, InvokeRequest, InvokeResponse, PollRequest, PollResponse } from './types';

/**
 * Account-client seam for invoke/poll/cancel. It is backed by in-process
 * account services, so task/agent callers never reach into src/account internals.
 *
 * If account-api is split again later, add a transport-backed implementation
 * at this seam without changing the business callers.
 */
@Injectable()
export class AccountInvokeClient {
  constructor(
    private readonly invokeSvc: InvokeService,
    private readonly pollSvc: PollService,
    private readonly cancelSvc: CancelService,
  ) {}

  invoke(req: InvokeRequest, signal?: AbortSignal): Promise<InvokeResponse> {
    return this.invokeSvc.invoke(req as unknown as InvokeRequestDto, signal) as unknown as Promise<InvokeResponse>;
  }

  /**
   * Streaming variant that yields meta/delta/done/error events.
   * `signal` aborts the vendor stream when the client disconnects.
   */
  stream(req: InvokeRequest, signal?: AbortSignal): AsyncGenerator<InvokeStreamEvent> {
    return this.invokeSvc.stream(req as unknown as InvokeRequestDto, signal);
  }

  poll(req: PollRequest, signal?: AbortSignal): Promise<PollResponse> {
    return this.pollSvc.poll(req as unknown as PollRequestDto, signal) as unknown as Promise<PollResponse>;
  }

  async cancel(req: CancelRequest): Promise<void> {
    await this.cancelSvc.cancel(req as unknown as CancelRequestDto);
  }
}
