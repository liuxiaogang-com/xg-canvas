import type { Task } from '../database/entities';
import type {
  FinalizePendingRequestLog,
  RequestLogService,
} from '../request-log/request-log.service';

export type PendingRequestLogFinalizer = Pick<RequestLogService, 'finalizePending'>;
export type { FinalizePendingRequestLog };

export function taskInvokeRequestId(task: Task): string | null {
  return task.invoke_request_id;
}
