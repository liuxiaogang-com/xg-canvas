import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IdentityModule } from '../identity/identity.module';
import { SetupController } from './setup.controller';
import { SetupGuard } from './setup.guard';
import { SetupService } from './setup.service';

@Module({
  imports: [AuthModule, IdentityModule],
  controllers: [SetupController],
  providers: [SetupService, SetupGuard],
  exports: [SetupService, SetupGuard],
})
export class SetupModule {}
