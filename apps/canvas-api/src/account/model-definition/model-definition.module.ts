import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { ModelSettings } from './model-settings.entity';
import { ModelDefinitionService } from './model-definition.service';
import { ModelDefinitionController } from './model-definition.controller';
import { ModelListService } from './model-list.service';

@Module({
  imports: [TypeOrmModule.forFeature([ModelSettings]), CatalogModule],
  controllers: [ModelDefinitionController],
  providers: [ModelDefinitionService, ModelListService],
  exports: [ModelDefinitionService, ModelListService],
})
export class ModelDefinitionModule {}
