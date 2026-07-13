import { DemoModelRegistry } from '../demo-model-registry';

describe('DemoModelRegistry', () => {
  const reg = new DemoModelRegistry();

  it('lists rich models filtered by task type', () => {
    const img = reg.list('gen.image');
    expect(img.length).toBeGreaterThan(0);
    expect(img.every((m) => m.task_types.includes('gen.image' as never))).toBe(true);
    expect(img[0].display_name).toBeTruthy();
    expect(img[0].provider.display_name).toBeTruthy();
    expect(img[0].pricing_summary).toBeTruthy();
  });

  it('derives a normalized param schema with enum chips + defaults', () => {
    const s = reg.schema('jimeng/image-v1');
    expect(s).not.toBeNull();
    const aspect = s!.params.find((p) => p.field === 'aspect_ratio');
    expect(aspect?.control).toBe('chips');
    expect(aspect?.options?.length).toBeGreaterThan(0);
    expect(s!.defaults.aspect_ratio).toBeDefined();
  });

  it('estimates a non-zero credit cost for video with batch', () => {
    const c = reg.estimateCost('jimeng/video-v1', { duration_sec: 10, batch: 2 });
    expect(c.estimated_credits).toBeGreaterThan(0);
    expect(c.breakdown).toContain('视频');
  });

  it('flags an invalid enum value', () => {
    const v = reg.validateParams('jimeng/image-v1', { aspect_ratio: '21:9' });
    expect(v.ok).toBe(false);
    expect(v.errors[0]?.field).toBe('aspect_ratio');
  });

  it('returns null schema for an unknown model', () => {
    expect(reg.schema('nope/x')).toBeNull();
  });
});
