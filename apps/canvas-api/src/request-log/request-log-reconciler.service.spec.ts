import { RequestLogReconcilerService } from './request-log-reconciler.service';

describe('RequestLogReconcilerService', () => {
  const dataSource = { query: jest.fn() };
  const logs = { finalizePending: jest.fn() };
  const config = { get: jest.fn(() => undefined) };
  const service = new RequestLogReconcilerService(
    dataSource as never,
    logs as never,
    config as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    logs.finalizePending.mockResolvedValue(true);
  });

  it('replays a referenced terminal Task and closes an uncorrelated crash orphan', async () => {
    dataSource.query.mockResolvedValue([
      {
        id: '11111111-1111-4111-8111-111111111111',
        task_status: 'succeeded',
        task_error: null,
        referenced_by_task: true,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        task_status: 'running',
        task_error: null,
        referenced_by_task: false,
      },
    ]);

    await expect(service.reconcileOnce()).resolves.toBe(2);

    expect(logs.finalizePending).toHaveBeenNthCalledWith(
      1,
      '11111111-1111-4111-8111-111111111111',
      { status: 'success' },
    );
    expect(logs.finalizePending).toHaveBeenNthCalledWith(
      2,
      '22222222-2222-4222-8222-222222222222',
      {
        status: 'timeout',
        error_code: 'REQUEST_LOG_ORPHANED',
        error_message: 'Process ended before the vendor attempt could be correlated to a Task',
      },
    );
  });

  it('uses the Task terminal error when a pending row survived a crash window', async () => {
    dataSource.query.mockResolvedValue([
      {
        id: '33333333-3333-4333-8333-333333333333',
        task_status: 'failed',
        task_error: { code: 'VENDOR_TIMEOUT', message: 'timed out' },
        referenced_by_task: true,
      },
    ]);

    await service.reconcileOnce();

    expect(logs.finalizePending).toHaveBeenCalledWith('33333333-3333-4333-8333-333333333333', {
      status: 'error',
      error_code: 'VENDOR_TIMEOUT',
      error_message: 'timed out',
    });
  });
});
