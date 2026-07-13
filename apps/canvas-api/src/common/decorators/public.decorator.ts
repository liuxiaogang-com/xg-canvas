import { SetMetadata } from '@nestjs/common';

/** Marks a route as not requiring a session. Read by the global SessionGuard. */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
