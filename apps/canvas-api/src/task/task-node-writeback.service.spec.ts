import type { EntityManager } from 'typeorm';

import type { Task } from '../database/entities';
import { TaskNodeWritebackService } from './task-node-writeback.service';

const TASK_ID = '11111111-1111-4111-8111-111111111111';
const NODE_ID = '22222222-2222-4222-8222-222222222222';
const CANVAS_ID = '33333333-3333-4333-8333-333333333333';
const PROJECT_ID = '44444444-4444-4444-8444-444444444444';
const WORKSPACE_ID = '55555555-5555-4555-8555-555555555555';

describe('TaskNodeWritebackService', () => {
  const manager = {
    query: jest.fn(),
    update: jest.fn(),
  } as unknown as EntityManager;
  const service = new TaskNodeWritebackService();

  beforeEach(() => jest.clearAllMocks());

  it('locks the workspace-owned node, rechecks newer tasks, and writes success', async () => {
    (manager.query as jest.Mock)
      .mockResolvedValueOnce([{ id: NODE_ID, canvas_id: CANVAS_ID, data: { status: 'running', task_id: TASK_ID } }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(service.applyTerminal(task({ status: 'succeeded', output_asset_ids: ['asset-1'] }), manager))
      .resolves.toBe(true);

    expect(manager.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('p.workspace_id = $3'),
      [NODE_ID, PROJECT_ID, WORKSPACE_ID],
    );
    expect(manager.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('candidate.workspace_id = $4'),
      [TASK_ID, NODE_ID, PROJECT_ID, WORKSPACE_ID],
    );
    expect(manager.update).toHaveBeenCalledWith(
      expect.any(Function),
      { id: NODE_ID, canvas_id: CANVAS_ID },
      { data: expect.objectContaining({ output_asset_id: 'asset-1', output_task_id: TASK_ID }) },
    );
  });

  it('does not let an older task overwrite a node after a newer task exists', async () => {
    (manager.query as jest.Mock)
      .mockResolvedValueOnce([{ id: NODE_ID, canvas_id: CANVAS_ID, data: {} }])
      .mockResolvedValueOnce([{ '?column?': 1 }]);

    await expect(service.applyTerminal(task({ status: 'failed' }), manager)).resolves.toBe(false);
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('rejects a historical dirty task whose node is outside its workspace', async () => {
    (manager.query as jest.Mock).mockResolvedValueOnce([]);

    await expect(service.applyTerminal(task({ status: 'succeeded' }), manager)).resolves.toBe(false);
    expect(manager.update).not.toHaveBeenCalled();
  });
});

function task(patch: Partial<Task>): Task {
  return {
    id: TASK_ID,
    owner_id: '66666666-6666-4666-8666-666666666666',
    source_node_id: NODE_ID,
    project_id: PROJECT_ID,
    workspace_id: WORKSPACE_ID,
    status: 'succeeded',
    output_asset_ids: [],
    ...patch,
  } as Task;
}
