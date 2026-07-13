import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FeatureConfigModule } from '../account/feature-config/feature-config.module';
import { BillingModule } from '../billing/billing.module';
import { RequestLog } from './request-log.entity';
import { RequestLogController } from './request-log.controller';
import { RequestLogService } from './request-log.service';
import { RequestLogAnalysisService } from './request-log-analysis.service';

/**
 * Global so any service (invoke / chat / validate / admin) can record a request
 * log without re-importing. The log lives in the `ops` schema. Imports BillingModule
 * so each write can freeze the request's cost (CostService).
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([RequestLog]), BillingModule, FeatureConfigModule],
  controllers: [RequestLogController],
  providers: [RequestLogService, RequestLogAnalysisService],
  exports: [RequestLogService],
})
export class RequestLogModule {}
