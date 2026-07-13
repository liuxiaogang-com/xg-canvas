const DEFAULT_SESSION_TTL_DAYS = 30;

/** One TTL calculation shared by the database session and browser cookie. */
export function sessionTtlMs(value: unknown): number {
  const days = Number(value ?? DEFAULT_SESSION_TTL_DAYS);
  const validDays = Number.isFinite(days) && days > 0 ? days : DEFAULT_SESSION_TTL_DAYS;
  return validDays * 86_400_000;
}
