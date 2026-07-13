import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CredentialModule } from '../credential/credential.module';
import { ModelDefinition } from './model-definition.entity';
import { ModelDefinitionService } from './model-definition.service';
import { ModelDefinitionController } from './model-definition.controller';
import { ModelListService } from './model-list.service';

// NOTE(M6 P1): ModelListController is intentionally NOT registered — its `models`
// route collides with canvas-api's own models.controller. P2 makes that endpoint
// delegate to ModelListService (exported below) for the non-demo path.
// @Global so canvas-api's ModelsController can inject ModelListService in-process.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ModelDefinition]), CredentialModule],
  controllers: [ModelDefinitionController],
  providers: [ModelDefinitionService, ModelListService],
  exports: [ModelDefinitionService, ModelListService],
})
export class ModelDefinitionModule {}
