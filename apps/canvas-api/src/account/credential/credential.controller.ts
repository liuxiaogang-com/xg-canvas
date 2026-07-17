import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { RequirePerm } from '../../authz/require-perm.decorator';
import { CredentialService } from './credential.service';
import { CredentialCatalogService } from './credential-catalog.service';
import { CreateCredentialDto } from './create-credential.dto';
import { UpdateCredentialDto } from './update-credential.dto';
import { ProviderModelsService } from './provider-models.service';
import {
  AddCredentialWithModelsDto,
  ImportVendorModelsDto,
  ProbeVendorModelsDto,
  VendorModelsQueryDto,
} from './credential-models.dto';

@ApiTags('Credentials')
@RequirePerm('system.credential.manage', { scope: 'system' })
@Controller('admin')
export class CredentialController {
  constructor(
    private readonly credentialService: CredentialService,
    private readonly credentialCatalog: CredentialCatalogService,
    private readonly providerModels: ProviderModelsService,
  ) {}

  @Get('credential-catalog')
  catalogView() {
    return this.credentialCatalog.getView();
  }

  @Post('channels/:channelId/credentials')
  create(@Param('channelId', ParseUUIDPipe) channelId: string, @Body() dto: CreateCredentialDto) {
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
  vendorModels(@Param('id', ParseUUIDPipe) id: string, @Query() query: VendorModelsQueryDto) {
    return this.providerModels.listVendorModels(
      id,
      query.channel_resource_uid,
      query.contract_profile,
    );
  }

  /** Import selected vendor ids as local Catalog model resources. */
  @Post('providers/:id/models/import')
  importModels(@Param('id', ParseUUIDPipe) id: string, @Body() body: ImportVendorModelsDto) {
    return this.providerModels.importModels(
      id,
      body.channel_resource_uid,
      body.vendor_model_ids ?? [],
      body.contract_profile,
    );
  }

  /** Wizard step: probe a provider's /models with a raw key (also a connectivity check). */
  @Post('providers/:id/probe-models')
  probeModels(@Param('id', ParseUUIDPipe) id: string, @Body() body: ProbeVendorModelsDto) {
    return this.providerModels.probeModels(
      id,
      body.channel_resource_uid,
      body.api_key,
      body.contract_profile,
    );
  }

  /** Atomically bind one exact Channel, Credential and selected Catalog models. */
  @Post('credentials')
  addCredential(@Body() body: AddCredentialWithModelsDto) {
    return this.providerModels.addCredentialWithModels(body);
  }
}
