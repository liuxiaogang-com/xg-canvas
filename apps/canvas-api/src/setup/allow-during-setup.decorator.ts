import { SetMetadata } from '@nestjs/common';

export const ALLOW_DURING_SETUP_KEY = 'allow-during-setup';
export const AllowDuringSetup = () => SetMetadata(ALLOW_DURING_SETUP_KEY, true);
