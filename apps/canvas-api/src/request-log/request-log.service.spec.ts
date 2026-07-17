import { RequestLogService, type RecordRequestLog } from './request-log.service';
import { REDACTED_SECRET } from '@xgcanvas/model-catalog';

describe('RequestLogService', () => {
  const queryBuilder = {
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: jest.fn(),
  };
  const repo = {
    insert: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
  const cost = { computeCost: jest.fn() };
  const service = new RequestLogService(repo as never, cost as never);

  beforeEach(() => jest.clearAllMocks());

  it('persists the exact model/rate pin and its computed cost', async () => {
    cost.computeCost.mockResolvedValue({ cost: 1.25, currency: 'CNY' });
    await service.record({
      id: '11111111-1111-4111-8111-111111111111',
      source: 'invoke',
      status: 'success',
      model_resource_uid: '22222222-2222-4222-8222-222222222222',
      model_revision_id: '33333333-3333-4333-8333-333333333333',
      rate_card_revision_id: '44444444-4444-4444-8444-444444444444',
      catalog_epoch: '9',
      usage: { image_count: 1 },
    });

    expect(cost.computeCost).toHaveBeenCalledWith('44444444-4444-4444-8444-444444444444', {
      image_count: 1,
    });
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        model_revision_id: '33333333-3333-4333-8333-333333333333',
        rate_card_revision_id: '44444444-4444-4444-8444-444444444444',
        catalog_epoch: '9',
        cost: 1.25,
        cost_currency: 'CNY',
        finished_at: expect.any(Date),
      }),
    );
  });

  it('does not calculate cost for failed requests', async () => {
    await service.record({
      id: '11111111-1111-4111-8111-111111111111',
      source: 'invoke',
      status: 'error',
      rate_card_revision_id: '44444444-4444-4444-8444-444444444444',
    });
    expect(cost.computeCost).not.toHaveBeenCalled();
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        cost: null,
        cost_currency: null,
      }),
    );
  });

  it('preserves an exact safe route and redacts nested diagnostic JSON', async () => {
    await service.record({
      ...pendingAttempt(),
      id: '99999999-9999-4999-8999-999999999999',
      channel_route: {
        key: 'safe',
        base_url: 'https://gateway.example/v1',
        options: { headers: { x_trace_id: 'trace' }, max_tokens: 1024 },
      },
      request_body: { nested: [{ apiKey: 'secret' }] },
      vendor_error: { cookie: 'secret' },
    });

    const inserted = repo.insert.mock.calls[0][0];
    expect(inserted.channel_route.options).toEqual({
      headers: { x_trace_id: 'trace' },
      max_tokens: 1024,
    });
    expect(inserted.request_body).toEqual({ nested: [{ apiKey: REDACTED_SECRET }] });
    expect(inserted.vendor_error).toEqual({ cookie: REDACTED_SECRET });
  });

  it('fails closed instead of mutating an unsafe operational route', async () => {
    await expect(
      service.record({
        ...pendingAttempt(),
        id: '99999999-9999-4999-8999-999999999999',
        channel_route: {
          key: 'unsafe',
          base_url: 'https://gateway.example/v1?access_token=secret',
          options: {},
        },
      }),
    ).rejects.toThrow('unsafe request-log channel route');
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('keeps async submits pending and finalizes actual usage exactly once', async () => {
    await service.record({
      ...pendingAttempt(),
      id: '11111111-1111-4111-8111-111111111111',
      rate_card_revision_id: '44444444-4444-4444-8444-444444444444',
      usage: { image_count: 1 },
    });
    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'pending',
        finished_at: null,
        cost: null,
      }),
    );

    repo.findOne.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      status: 'pending',
      rate_card_revision_id: '44444444-4444-4444-8444-444444444444',
      usage: { image_count: 1 },
      response_body: null,
    });
    cost.computeCost.mockResolvedValue({ cost: 2.5, currency: 'CNY' });
    queryBuilder.execute.mockResolvedValue({ affected: 1 });

    await expect(
      service.finalizePending('11111111-1111-4111-8111-111111111111', {
        status: 'success',
        usage: { duration_seconds: 5 },
      }),
    ).resolves.toBe(true);

    expect(cost.computeCost).toHaveBeenCalledWith('44444444-4444-4444-8444-444444444444', {
      image_count: 1,
      duration_seconds: 5,
    });
    expect(queryBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        usage: { image_count: 1, duration_seconds: 5 },
        cost: '2.5',
        cost_currency: 'CNY',
        finished_at: expect.any(Date),
      }),
    );
    expect(queryBuilder.where).toHaveBeenCalledWith('id = :id AND status = :pending', {
      id: '11111111-1111-4111-8111-111111111111',
      pending: 'pending',
    });
  });

  it('rejects pending and incomplete physical-attempt rows before the database', async () => {
    await expect(
      service.record({ id: 'request-without-attempt', source: 'invoke', status: 'pending' }),
    ).rejects.toThrow('pending request log must be a physical attempt');

    await expect(
      service.record({
        id: 'incomplete-attempt',
        source: 'invoke',
        status: 'error',
        attempt_no: 1,
      }),
    ).rejects.toThrow('physical request log is missing logical_request_id');
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('enriches a pre-inserted async attempt without ending the pending ledger row', async () => {
    repo.findOne.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      status: 'pending',
      usage: { requests: 1 },
      latency_ms: null,
      response_body: null,
    });
    queryBuilder.execute.mockResolvedValue({ affected: 1 });

    await expect(
      service.updatePending('55555555-5555-4555-8555-555555555555', {
        usage: { image_count: 1 },
        latency_ms: 250,
        response_body: { external_task_id: 'vendor-task' },
      }),
    ).resolves.toBe(true);

    expect(queryBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: { requests: 1, image_count: 1 },
        latency_ms: 250,
        response_body: { external_task_id: 'vendor-task' },
      }),
    );
  });

  it('refuses an unfiltered purge without issuing a delete', async () => {
    await expect(service.purge({})).resolves.toBe(0);

    expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    expect(queryBuilder.delete).not.toHaveBeenCalled();
  });

  it('never deletes pending rows', async () => {
    await expect(
      service.purge({
        before: new Date('2026-01-01T00:00:00.000Z'),
        status: 'pending',
      }),
    ).resolves.toBe(0);

    expect(repo.createQueryBuilder).not.toHaveBeenCalled();
    expect(queryBuilder.delete).not.toHaveBeenCalled();
  });

  it('adds a pending-row guard to every filtered purge', async () => {
    const before = new Date('2026-01-01T00:00:00.000Z');
    queryBuilder.execute.mockResolvedValue({ affected: 2 });

    await expect(service.purge({ before })).resolves.toBe(2);

    expect(queryBuilder.delete).toHaveBeenCalledTimes(1);
    expect(queryBuilder.where).toHaveBeenCalledWith(
      "status <> 'pending' AND created_at < :before",
      { before },
    );
  });
});

function pendingAttempt(): RecordRequestLog {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    logical_request_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    attempt_no: 1,
    source: 'invoke',
    workspace_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    task_id: 'task-a',
    model_id: 'example:model',
    model_resource_uid: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    model_revision_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    catalog_epoch: '1',
    adapter_key: 'test-adapter',
    channel_resource_uid: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    channel_revision_id: '11111111-1111-4111-8111-111111111111',
    channel_route: {
      key: 'default',
      base_url: 'https://gateway.example/v1',
      options: {},
    },
    credential_id: '22222222-2222-4222-8222-222222222222',
    status: 'pending',
  };
}
