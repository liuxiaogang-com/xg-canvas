/**
 * Task state machine.
 *
 *   pending --enqueue--> queued --start--> running --vendor: succeeded--> succeeded
 *                                                  --vendor: failed-->     failed
 *                                                  --user: cancel-->       cancelled
 *
 * Re-tries reset running -> queued (handled in retry-policy.ts), but never
 * re-enter pending from a terminal state.
 */

export type TaskStatus = 'pending' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

const ALLOWED: Record<TaskStatus, readonly TaskStatus[]> = {
  pending: ['queued', 'cancelled'],
  queued: ['running', 'cancelled', 'failed'],
  running: ['succeeded', 'failed', 'cancelled', 'queued'], // queued = retry
  succeeded: [],
  failed: ['queued'], // manual retry
  cancelled: ['queued'], // manual restart
};

export const TERMINAL_STATUSES: readonly TaskStatus[] = ['succeeded', 'failed', 'cancelled'];

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`invalid task transition: ${from} -> ${to}`);
  }
}

export function isTerminal(s: TaskStatus): boolean {
  return TERMINAL_STATUSES.includes(s);
}
