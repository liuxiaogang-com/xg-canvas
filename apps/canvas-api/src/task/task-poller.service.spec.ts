import { TaskPollerService } from './task-poller.service';

describe('TaskPollerService Catalog revision failures', () => {
  const tasks = {
    releasePoll: jest.fn(),
    schedulePollRetry: jest.fn(),
    scheduleRetry: jest.fn(),
  };
  const invoke = { poll: jest.fn() };
  const terminal = { fail: jest.fn(), succeed: jest.fn(), finalizeInvokeRequest: jest.fn() };
  const config = { get: jest.fn(() => undefined) };
  const service = new TaskPollerService(
    tasks as never,
    invoke as never,
    terminal as never,
    config as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('fails immediately instead of retrying a missing immutable revision', async () => {
    invoke.poll.mockRejectedValue(
      Object.assign(new Error('revision was removed'), {
        code: 'CATALOG_REVISION_MISSING',
      }),
    );
    const task = pollTask();

    await service.pollOne(task as never);

    expect(terminal.fail).toHaveBeenCalledWith(
      task.id,
      task.lease_token,
      'CATALOG_REVISION_MISSING',
      'revision was removed',
    );
    expect(tasks.releasePoll).not.toHaveBeenCalled();
    expect(tasks.schedulePollRetry).not.toHaveBeenCalled();
  });

  it('forwards terminal vendor usage for exact async request billing', async () => {
    const task = pollTask();
    invoke.poll.mockResolvedValue({
      response: {
        status: 'succeeded',
        assets: [],
        usage: { duration_seconds: 5 },
      },
    });

    await service.pollOne(task as never);

    expect(terminal.succeed).toHaveBeenCalledWith(task.id, task.lease_token, {
      assets: [],
      text: undefined,
      json: undefined,
      usage: { duration_seconds: 5 },
    });
  });

  it('finalizes a failed async attempt before clearing its request correlation for retry', async () => {
    const task = pollTask();
    invoke.poll.mockResolvedValue({
      response: {
        status: 'failed',
        assets: [],
        usage: { duration_seconds: 2 },
        error: { code: 'VENDOR_UNAVAILABLE', message: 'temporary outage' },
      },
    });

    await service.pollOne(task as never);

    expect(terminal.finalizeInvokeRequest).toHaveBeenCalledWith(task.invoke_request_id, {
      status: 'error',
      usage: { duration_seconds: 2 },
      error_code: 'VENDOR_UNAVAILABLE',
      error_message: 'temporary outage',
    });
    expect(tasks.scheduleRetry).toHaveBeenCalledWith(
      task.id,
      task.lease_token,
      'VENDOR_UNAVAILABLE',
      'temporary outage',
      expect.any(Date),
    );
    expect(terminal.finalizeInvokeRequest.mock.invocationCallOrder[0]).toBeLessThan(
      tasks.scheduleRetry.mock.invocationCallOrder[0],
    );
  });
});

function pollTask() {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    lease_token: '22222222-2222-4222-8222-222222222222',
    external_task_id: 'vendor-task',
    invoke_request_id: '88888888-8888-4888-8888-888888888888',
    channel_resource_uid: '33333333-3333-4333-8333-333333333333',
    channel_revision_id: '99999999-9999-4999-8999-999999999999',
    channel_route: { key: 'example', base_url: 'https://vendor.test', options: {} },
    credential_id: '44444444-4444-4444-8444-444444444444',
    model_id: 'example:model',
    execution_mode: 'live',
    model_resource_uid: '55555555-5555-4555-8555-555555555555',
    model_revision_id: '66666666-6666-4666-8666-666666666666',
    rate_card_revision_id: null,
    catalog_epoch: '2',
    workspace_id: '77777777-7777-4777-8777-777777777777',
    project_id: null,
    retry_count: 0,
    error: null,
    progress: 0,
    started_at: new Date(),
  };
}
