import { canTransition, isTerminal } from '../state-machine';

describe('task state machine', () => {
  it('happy path', () => {
    expect(canTransition('pending', 'queued')).toBe(true);
    expect(canTransition('queued', 'running')).toBe(true);
    expect(canTransition('running', 'succeeded')).toBe(true);
  });

  it('terminal statuses cannot leave except via manual retry', () => {
    expect(canTransition('succeeded', 'queued')).toBe(false);
    expect(canTransition('failed', 'queued')).toBe(true);
    expect(canTransition('cancelled', 'queued')).toBe(true);
    expect(isTerminal('succeeded')).toBe(true);
    expect(isTerminal('running')).toBe(false);
  });

  it('rejects nonsense', () => {
    expect(canTransition('pending', 'running')).toBe(false);
    expect(canTransition('queued', 'succeeded')).toBe(false);
  });
});
