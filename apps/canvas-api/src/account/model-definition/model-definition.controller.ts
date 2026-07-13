import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { RequirePerm } from '../../authz/require-perm.decorator';
import { ModelDefinitionService } from './model-definition.service';
import { CreateModelDefinitionDto } from './create-model-definition.dto';
import { UpdateModelDefinitionDto } from './update-model-definition.dto';

@ApiTags('Model Definitions')
@RequirePerm('system.model.manage', { scope: 'system' })
@Controller('admin/models')
export class ModelDefinitionController {
  constructor(private readonly modelDefinitionService: ModelDefinitionService) {}

  @Post()
  create(@Body() dto: CreateModelDefinitionDto) {
    return this.modelDefinitionService.create(dto);
  }

  @Get()
  findAll(@Query('all') all?: string) {
    return this.modelDefinitionService.findAll(all === 'true');
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.modelDefinitionService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateModelDefinitionDto) {
    return this.modelDefinitionService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.modelDefinitionService.remove(id);
  }
}
