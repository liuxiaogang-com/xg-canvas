import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MockExecutorService } from './mock-executor.service';
import { TaskExecutorService } from './task-executor.service';
import { TaskPollerService } from './task-poller.service';
import { type ClaimedTask, TaskService } from './task.service';

const TICK_MS = 1000;
const POLL_MS = 3000;
const DEFAULT_CONCURRENCY = 8;
const DEFAULT_LEASE_MS = 120_000;

@Injectable()
export class TaskRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaskRunnerService.name);
  private tickTimer?: NodeJS.Timeout;
  private pollTimer?: NodeJS.Timeout;
  private inFlight = 0;
  private dispatching = false;
  private readonly concurrency: number;
  private readonly enabled: boolean;
  private readonly leaseMs: number;

  constructor(
    private readonly tasks: TaskService,
    private readonly executor: TaskExecutorService,
    private readonly mockExecutor: MockExecutorService,
    private readonly poller: TaskPollerService,
    config: ConfigService,
  ) {
    this.concurrency = positiveInteger(config, 'TASK_CONCURRENCY', DEFAULT_CONCURRENCY, 1, 128);
    this.enabled = config.get<string>('TASK_RUNNER_ENABLED', 'true') === 'true';
    this.leaseMs = positiveInteger(config, 'TASK_LEASE_MS', DEFAULT_LEASE_MS, 30_000, 3_600_000);
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('TASK_RUNNER_ENABLED=false — runner idle');
      return;
    }
    this.tickTimer = setInterval(() => this.tick().catch((e) => this.logger.error(e)), TICK_MS);
    this.pollTimer = setInterval(
      () => this.pollRunning().catch((e) => this.logger.error(e)),
      POLL_MS,
    );
    this.logger.log(`TaskRunner started (concurrency=${this.concurrency})`);
  }

  onModuleDestroy(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  private async tick(): Promise<void> {
    if (!this.tasks.isCatalogReady()) return;
    const claimed = await this.claimWithinCapacity((slots) =>
      this.tasks.claimPending(slots, this.leaseMs, ['live', 'demo']),
    );
    if (claimed.length > 0) {
      for (const t of claimed) {
        const runner = t.execution_mode === 'demo' ? this.mockExecutor : this.executor;
        this.withHeartbeat(t, (signal) => runner.run(t, signal))
          .catch((e) => this.logger.error(`task ${t.id} crashed: ${(e as Error).message}`))
          .finally(() => {
            this.inFlight -= 1;
          });
      }
    }
  }

  private async pollRunning(): Promise<void> {
    if (!this.tasks.isCatalogReady()) return;
    const due = await this.claimWithinCapacity((slots) =>
      this.tasks.claimDuePolls(slots, this.leaseMs, ['live']),
    );
    for (const t of due) {
      this.withHeartbeat(t, (signal) => this.poller.pollOne(t, signal))
        .catch((e) => this.logger.error(`poll ${t.id} crashed: ${(e as Error).message}`))
        .finally(() => {
          this.inFlight -= 1;
        });
    }
  }

  /** Serialize claim rounds so invoke and poll share one hard concurrency cap. */
  private async claimWithinCapacity(
    claim: (slots: number) => Promise<ClaimedTask[]>,
  ): Promise<ClaimedTask[]> {
    if (this.dispatching) return [];
    this.dispatching = true;
    try {
      const slots = this.concurrency - this.inFlight;
      if (slots <= 0) return [];
      const tasks = await claim(slots);
      this.inFlight += tasks.length;
      return tasks;
    } finally {
      this.dispatching = false;
    }
  }

  private async withHeartbeat(
    task: ClaimedTask,
    work: (signal: AbortSignal) => Promise<void>,
  ): Promise<void> {
    const controller = new AbortController();
    let renewing = false;
    const timer = setInterval(
      async () => {
        if (renewing || controller.signal.aborted) return;
        renewing = true;
        try {
          const held = await this.tasks.renewLease(task.id, task.lease_token, this.leaseMs);
          if (!held) controller.abort(new Error('task lease lost'));
        } catch (error) {
          controller.abort(error);
        } finally {
          renewing = false;
        }
      },
      Math.max(5_000, Math.min(10_000, Math.floor(this.leaseMs / 3))),
    );

    try {
      await work(controller.signal);
    } finally {
      clearInterval(timer);
    }
  }
}

function positiveInteger(
  config: ConfigService,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = config.get<string>(key);
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${key} must be an integer between ${min} and ${max}`);
  }
  return value;
}
