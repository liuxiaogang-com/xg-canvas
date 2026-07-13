import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_DURING_SETUP_KEY } from './allow-during-setup.decorator';
import { SetupService } from './setup.service';

@Injectable()
export class SetupGuard implements CanActivate {
  constructor(private readonly setup: SetupService, private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_DURING_SETUP_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (allowed || !(await this.setup.isRequired())) return true;
    throw new ServiceUnavailableException({
      code: 'SETUP_REQUIRED',
      message: '实例尚未完成初始化',
    });
  }
}
