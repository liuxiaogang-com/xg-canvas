import { Controller, Get } from '@nestjs/common';

import { RequirePerm } from '../authz/require-perm.decorator';
import { BillingService } from './billing.service';

/** Real billing analytics over the request-log ledger (frozen per-request cost). */
@RequirePerm('system.billing.view', { scope: 'system' })
@Controller('admin/billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('overview')
  overview() {
    return this.billing.overview();
  }

  @Get('by-model')
  byModel() {
    return this.billing.byModel();
  }

  @Get('by-member')
  byMember() {
    return this.billing.byMember();
  }

  @Get('by-project')
  byProject() {
    return this.billing.byProject();
  }
}
