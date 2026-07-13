import { ConflictException } from '@nestjs/common';

import { assertNoCycle } from './connection-validator';

const E = (s: string, t: string) => ({ source_node_id: s, target_node_id: t });

describe('assertNoCycle', () => {
  it('allows an edge that keeps the graph acyclic', () => {
    expect(() => assertNoCycle([E('a', 'b'), E('b', 'c')], 'a', 'c')).not.toThrow();
  });

  it('rejects a self-loop', () => {
    expect(() => assertNoCycle([], 'a', 'a')).toThrow(ConflictException);
  });

  it('rejects a direct back-edge (B->A when A->B exists)', () => {
    expect(() => assertNoCycle([E('a', 'b')], 'b', 'a')).toThrow(ConflictException);
  });

  it('rejects a transitive cycle (A->B->C, then C->A)', () => {
    expect(() => assertNoCycle([E('a', 'b'), E('b', 'c')], 'c', 'a')).toThrow(ConflictException);
  });

  it('allows branching into a fresh node', () => {
    expect(() => assertNoCycle([E('a', 'b'), E('a', 'c')], 'b', 'd')).not.toThrow();
  });
});
