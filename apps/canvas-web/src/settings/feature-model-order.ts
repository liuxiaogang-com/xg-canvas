/** Toggle a stable resource identity while preserving the operator's priority order. */
export function toggleResourceUid(current: readonly string[], resourceUid: string): string[] {
  return current.includes(resourceUid)
    ? current.filter((candidate) => candidate !== resourceUid)
    : [...current, resourceUid];
}

/** Move one resource by a single relative position without mutating caller state. */
export function moveResourceUid(
  current: readonly string[],
  resourceUid: string,
  direction: -1 | 1,
): string[] {
  const from = current.indexOf(resourceUid);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= current.length) return [...current];
  const next = [...current];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
