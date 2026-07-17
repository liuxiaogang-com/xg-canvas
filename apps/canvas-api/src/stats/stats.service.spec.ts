import { StatsService } from './stats.service';

const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';

describe('StatsService workspace task statistics', () => {
  it('always scopes queries and never returns synthetic cost fields', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { status: 'succeeded', count: '3' },
        { status: 'failed', count: '1' },
      ])
      .mockResolvedValueOnce([{
        project_id: 'project-1',
        project_name: 'Project One',
        total: '4',
        succeeded: '3',
        failed: '1',
      }])
      .mockResolvedValueOnce([{
        model_id: 'provider:model',
        total: '4',
        succeeded: '3',
        last_used_at: '2026-07-16T00:00:00.000Z',
      }])
      .mockResolvedValueOnce([{
        owner_id: 'user-1',
        display_name: 'Alice',
        total: '4',
        succeeded: '3',
        failed: '1',
      }]);
    const service = new StatsService({ query } as never);

    await expect(service.overview(WORKSPACE_ID)).resolves.toEqual({
      total: 4,
      succeeded: 3,
      failed: 1,
      cancelled: 0,
      running: 0,
      queued: 0,
    });
    await expect(service.byProject(WORKSPACE_ID)).resolves.toEqual([{
      project_id: 'project-1',
      project_name: 'Project One',
      total: 4,
      succeeded: 3,
      failed: 1,
    }]);
    await expect(service.byModel(WORKSPACE_ID)).resolves.toEqual([{
      model_id: 'provider:model',
      total: 4,
      succeeded: 3,
      success_rate: 75,
      last_used_at: new Date('2026-07-16T00:00:00.000Z'),
    }]);
    await expect(service.byMember(WORKSPACE_ID)).resolves.toEqual([{
      owner_id: 'user-1',
      display_name: 'Alice',
      email: null,
      total: 4,
      succeeded: 3,
      failed: 1,
    }]);

    expect(query).toHaveBeenCalledTimes(4);
    for (const [sql, params] of query.mock.calls) {
      expect(sql).toMatch(/WHERE\s+(?:t\.)?workspace_id\s*=\s*\$1/i);
      expect(params).toEqual([WORKSPACE_ID]);
      expect(sql).not.toMatch(/cost/i);
    }
  });
});
