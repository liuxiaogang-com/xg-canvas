import type { Task } from '../database/entities';
import { presentTask } from './task.presenter';

describe('presentTask', () => {
  it('exposes the client task contract without Catalog pins, credentials or vendor routing', () => {
    const publicTask = presentTask(task());

    expect(publicTask).toMatchObject({
      id: 'task-1',
      model_id: 'example:model',
      error: { code: 'VENDOR_REJECTED', message: 'failed' },
    });
    expect(publicTask).not.toHaveProperty('model_resource_uid');
    expect(publicTask).not.toHaveProperty('model_revision_id');
    expect(publicTask).not.toHaveProperty('rate_card_revision_id');
    expect(publicTask).not.toHaveProperty('catalog_epoch');
    expect(publicTask).not.toHaveProperty('credential_id');
    expect(publicTask).not.toHaveProperty('channel_resource_uid');
    expect(publicTask).not.toHaveProperty('external_task_id');
    expect(publicTask).not.toHaveProperty('invoke_request_id');
    expect(publicTask).not.toHaveProperty('invoke_logical_request_id');
    expect(publicTask).not.toHaveProperty('invoke_prepared_at');
    expect(publicTask).not.toHaveProperty('channel_revision_id');
    expect(publicTask).not.toHaveProperty('channel_route');
    expect(publicTask).not.toHaveProperty('owner_id');
    expect(publicTask).not.toHaveProperty('lease_token');
    expect(publicTask.error).not.toHaveProperty('vendor');
  });
});

function task(): Task {
  const now = new Date();
  return {
    id: 'task-1',
    type: 'gen.image',
    status: 'failed',
    model_id: 'example:model',
    model_resource_uid: '11111111-1111-4111-8111-111111111111',
    model_revision_id: '22222222-2222-4222-8222-222222222222',
    rate_card_revision_id: null,
    catalog_epoch: '8',
    external_task_id: 'vendor-task',
    invoke_request_id: '88888888-8888-4888-8888-888888888888',
    invoke_logical_request_id: '99999999-9999-4999-8999-999999999999',
    invoke_prepared_at: now,
    channel_resource_uid: '33333333-3333-4333-8333-333333333333',
    channel_revision_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    channel_route: { key: 'example', base_url: 'https://example.test', options: {} },
    credential_id: '44444444-4444-4444-8444-444444444444',
    source_node_id: null,
    project_id: null,
    workspace_id: '55555555-5555-4555-8555-555555555555',
    owner_id: '66666666-6666-4666-8666-666666666666',
    params: {},
    inputs: {},
    output_asset_ids: [],
    text_output: null,
    json_output: null,
    progress: null,
    error: { code: 'VENDOR_REJECTED', message: 'failed', vendor: { secret: true } },
    retry_count: 0,
    attempt_no: 1,
    lease_token: '77777777-7777-4777-8777-777777777777',
    lease_expires_at: now,
    next_poll_at: null,
    started_at: now,
    finished_at: now,
    created_at: now,
    updated_at: now,
  };
}
