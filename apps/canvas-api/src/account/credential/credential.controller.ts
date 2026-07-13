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
import { CredentialService } from './credential.service';
import { CreateCredentialDto } from './create-credential.dto';
import { UpdateCredentialDto } from './update-credential.dto';
import { ProviderModelsService } from './provider-models.service';

@ApiTags('Credentials')
@RequirePerm('system.credential.manage', { scope: 'system' })
@Controller('admin')
export class CredentialController {
  constructor(
    private readonly credentialService: CredentialService,
    private readonly providerModels: ProviderModelsService,
  ) {}

  @Post('channels/:channelId/credentials')
  create(
    @Param('channelId', ParseUUIDPipe) channelId: string,
    @Body() dto: CreateCredentialDto,
  ) {
    return this.credentialService.create(channelId, dto);
  }

  @Get('channels/:channelId/credentials')
  findAllByChannel(@Param('channelId', ParseUUIDPipe) channelId: string) {
    return this.credentialService.findAllByChannel(channelId);
  }

  @Get('credentials/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.credentialService.findOne(id);
  }

  @Patch('credentials/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCredentialDto) {
    return this.credentialService.update(id, dto);
  }

  @Delete('credentials/:id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.credentialService.remove(id);
  }

  @Post('credentials/:id/validate')
  validate(@Param('id', ParseUUIDPipe) id: string) {
    return this.credentialService.validate(id);
  }

  /** Balance for one credential (a balance belongs to a key/account). */
  @Get('credentials/:id/balance')
  credentialBalance(@Param('id', ParseUUIDPipe) id: string) {
    return this.credentialService.credentialBalance(id);
  }

  /** Provider status (balance / membership / …) for the list 状态 column. */
  @Get('providers/:id/status')
  providerStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.credentialService.providerStatus(id);
  }

  /** Pull the provider's live model catalogue, flagged with which are already imported. */
  @Get('providers/:id/models')
  vendorModels(@Param('id', ParseUUIDPipe) id: string) {
    return this.providerModels.listVendorModels(id);
  }

  /** Enable selected vendor models as manual model definitions. */
  @Post('providers/:id/models/import')
  importModels(@Param('id', ParseUUIDPipe) id: string, @Body() body: { model_ids: string[] }) {
    return this.providerModels.importModels(id, body.model_ids ?? []);
  }

  /** Wizard step: probe a provider's /models with a raw key (also a connectivity check). */
  @Post('providers/:id/probe-models')
  probeModels(@Param('id', ParseUUIDPipe) id: string, @Body() body: { api_key: string }) {
    return this.providerModels.probeModels(id, body.api_key ?? '');
  }

  /** Credential-centric add-key: auto default channel + credential + enable selected models. */
  @Post('credentials')
  addCredential(
    @Body()
    body: {
      provider_id: string;
      label?: string;
      payload: Record<string, string>;
      model_ids?: string[];
      preset_model_ids?: string[];
    },
  ) {
    return this.providerModels.addCredentialWithModels(body);
  }
}
