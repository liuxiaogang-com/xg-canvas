import { AdapterError } from '@xgcanvas/adapters-contract';
import { ERROR_CODES } from '@xgcanvas/shared-types';

import type {
  DoubaoVideoQueryResponse,
  DoubaoVideoSubmitRequest,
  DoubaoVideoSubmitResponse,
} from './types';

export interface DoubaoVideoCredential {
  ak: string;
  sk: string;
}

/**
 * Same caveat as DoubaoImageClient: signing belongs to the volcengine
 * sdk we'll wire next. Skeleton throws to prevent silent failure.
 */
export class DoubaoVideoClient {
  async submit(_req: DoubaoVideoSubmitRequest, _cred: DoubaoVideoCredential): Promise<DoubaoVideoSubmitResponse> {
    throw notImplemented('submit');
  }

  async query(_taskId: string, _cred: DoubaoVideoCredential): Promise<DoubaoVideoQueryResponse> {
    throw notImplemented('query');
  }
}

function notImplemented(action: string): AdapterError {
  return new AdapterError({
    code: ERROR_CODES.ADAPTER_INTERNAL,
    message: `doubao-video client.${action} not yet implemented (S1.6 follow-up)`,
  });
}
