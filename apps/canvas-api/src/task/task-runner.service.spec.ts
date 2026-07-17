import type { ConfigService } from '@nestjs/config';

import type { TaskExecutorService } from './task-executor.service';
import type { TaskPollerService } from './task-poller.service';
import { TaskRunnerService } from './task-runner.service';
import type { ClaimedTask, TaskService } from './task.service';

describe('TaskRunnerService concurrency', () => {
  const tasks = {
    claimPending: jest.fn(),
    claimDuePolls: jest.fn(),
    renewLease: jest.fn(),
    isCatalogReady: jest.fn(() => true),
  } as unknown as TaskService;
  const executor = { run: jest.fn() } as unknown as TaskExecutorService;
  const poller = { pollOne: jest.fn() } as unknown as TaskPollerService;

  beforeEach(() => {
    jest.clearAllMocks();
    (tasks.renewLease as jest.Mock).mockResolvedValue(true);
  });

  it('shares one hard slot between invoke and poll claim rounds', async () => {
    const invokeWork = deferred<void>();
    const pollWork = deferred<void>();
    (tasks.claimPending as jest.Mock).mockResolvedValue([claimed('task-1')]);
    (tasks.claimDuePolls as jest.Mock).mockResolvedValue([claimed('task-2')]);
    (executor.run as jest.Mock).mockReturnValue(invokeWork.promise);
    (poller.pollOne as jest.Mock).mockReturnValue(pollWork.promise);
    const runner = makeRunner({ TASK_CONCURRENCY: '1' });

    await callPrivate(runner, 'tick');
    await callPrivate(runner, 'pollRunning');
    expect(tasks.claimDuePolls).not.toHaveBeenCalled();

    invokeWork.resolve();
    await flushPromises();
    await callPrivate(runner, 'pollRunning');
    await callPrivate(runner, 'tick');
    expect(tasks.claimPending).toHaveBeenCalledTimes(1);

    pollWork.resolve();
    await flushPromises();
    expect(tasks.claimPending).toHaveBeenCalledWith(1, 120_000);
    expect(tasks.claimDuePolls).toHaveBeenCalledWith(1, 120_000);
  });

  it('dispatches every claimed task through the real executor', async () => {
    (tasks.claimPending as jest.Mock).mockResolvedValue([claimed('task-1'), claimed('task-2')]);
    (executor.run as jest.Mock).mockResolvedValue(undefined);
    const runner = makeRunner({ TASK_CONCURRENCY: '2' });

    await callPrivate(runner, 'tick');
    await flushPromises();

    expect(executor.run).toHaveBeenCalledTimes(2);
    expect(executor.run).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-1' }),
      expect.any(AbortSignal),
    );
    expect(executor.run).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-2' }),
      expect.any(AbortSignal),
    );
  });

  it('fails fast on an invalid numeric concurrency setting', () => {
    expect(() => makeRunner({ TASK_CONCURRENCY: 'NaN' })).toThrow(
      'TASK_CONCURRENCY must be an integer between 1 and 128',
    );
  });

  function makeRunner(values: Record<string, string>): TaskRunnerService {
    const config = {
      get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
    } as unknown as ConfigService;
    return new TaskRunnerService(tasks, executor, poller, config);
  }
});

async function callPrivate(
  runner: TaskRunnerService,
  method: 'tick' | 'pollRunning',
): Promise<void> {
  await (runner as unknown as Record<string, () => Promise<void>>)[method]();
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function claimed(id: string): ClaimedTask {
  return {
    id,
    lease_token: '11111111-1111-4111-8111-111111111111',
    lease_expires_at: new Date(Date.now() + 60_000),
  } as ClaimedTask;
}
