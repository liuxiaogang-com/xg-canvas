import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { RequirePerm } from '../../authz/require-perm.decorator';
import { ChannelService } from './channel.service';
import { CreateChannelDto } from './create-channel.dto';
import { UpdateChannelDto } from './update-channel.dto';

@ApiTags('Channels')
@RequirePerm('system.model.manage', { scope: 'system' })
@Controller('admin')
export class ChannelController {
  constructor(private readonly channelService: ChannelService) {}

  @Post('providers/:providerId/channels')
  create(
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @Body() dto: CreateChannelDto,
  ) {
    return this.channelService.create(providerId, dto);
  }

  @Get('providers/:providerId/channels')
  findAllByProvider(@Param('providerId', ParseUUIDPipe) providerId: string) {
    return this.channelService.findAllByProvider(providerId);
  }

  @Get('channels/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.channelService.findOne(id);
  }

  @Patch('channels/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateChannelDto) {
    return this.channelService.update(id, dto);
  }

  @Delete('channels/:id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.channelService.remove(id);
  }
}
