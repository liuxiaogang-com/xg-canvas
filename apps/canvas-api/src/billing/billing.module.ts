import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ModelDefinition } from '../account/model-definition/model-definition.entity';
import { RequestLog } from '../request-log/request-log.entity';
import { CostService } from './cost.service';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';

/**
 * Billing — frozen per-request cost (CostService) + analytics over the request-log
 * ledger (BillingService). CostService is exported so RequestLogService can freeze cost
 * at write time.
 */
@Module({
  imports: [TypeOrmModule.forFeature([RequestLog, ModelDefinition])],
  controllers: [BillingController],
  providers: [CostService, BillingService],
  exports: [CostService, BillingService],
})
export class BillingModule {}
