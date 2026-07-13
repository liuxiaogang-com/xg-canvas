import { Controller, Get } from '@nestjs/common';

import { Public } from '../common/decorators/public.decorator';
import { AllowDuringSetup } from '../setup/allow-during-setup.decorator';

@Public()
@AllowDuringSetup()
@Controller('health')
export class HealthController {
  @Get()
  health() {
    return { status: 'ok', service: 'canvas-api' };
  }
}
