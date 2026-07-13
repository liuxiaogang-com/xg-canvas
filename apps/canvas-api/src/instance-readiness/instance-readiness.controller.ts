import { Controller, Get } from '@nestjs/common';

import { InstanceReadinessService } from './instance-readiness.service';

/** Authenticated users (any role) may inspect capability readiness — no secrets. */
@Controller('instance')
export class InstanceReadinessController {
  constructor(private readonly readiness: InstanceReadinessService) {}

  @Get('readiness')
  get() {
    return this.readiness.snapshot();
  }
}
