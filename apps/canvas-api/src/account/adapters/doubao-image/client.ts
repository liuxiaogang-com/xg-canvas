import { AdapterError } from '@xgcanvas/adapters-contract';
import { ERROR_CODES } from '@xgcanvas/shared-types';

import { httpJson } from '../_shared/http-client';
import type {
  DoubaoImageQueryResponse,
  DoubaoImageSubmitRequest,
  DoubaoImageSubmitResponse,
} from './types';

const DEFAULT_BASE = 'https://visual.volcengineapi.com';

export interface DoubaoCredential {
  ak: string;
  sk: string;
}

export class DoubaoImageClient {
  constructor(private readonly base: string = DEFAULT_BASE) {}

  /**
   * NOTE: Volcengine signed v4 signing lives in this client. The signing
   * helper is intentionally elided here — we delegate to the upstream
   * volcengine-openapi sdk (added in S1.6 alongside this skeleton's
   * unit-test scaffolding). Until then this throws to make accidental
   * production use impossible.
   */
  async submit(_req: DoubaoImageSubmitRequest, _cred: DoubaoCredential): Promise<DoubaoImageSubmitResponse> {
    throw notImplemented('submit');
  }

  async query(_taskId: string, _cred: DoubaoCredential): Promise<DoubaoImageQueryResponse> {
    throw notImplemented('query');
  }
}

function notImplemented(action: string): AdapterError {
  return new AdapterError({
    code: ERROR_CODES.ADAPTER_INTERNAL,
    message: `doubao-image client.${action} not yet implemented (S1.6 follow-up)`,
  });
}

// Keep httpJson reachable so future signing impl reuses retry/timeout.
export { httpJson };
