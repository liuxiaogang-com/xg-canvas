import { PartialType } from '@nestjs/swagger';
import { CreateModelDefinitionDto } from './create-model-definition.dto';

export class UpdateModelDefinitionDto extends PartialType(CreateModelDefinitionDto) {}
