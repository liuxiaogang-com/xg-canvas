import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { RequirePerm } from '../../authz/require-perm.decorator';
import { UpdateSmtpSettingsDto } from './smtp-settings.dto';
import { SmtpSettingsClient } from './smtp-settings.client';

@Controller('admin/system-settings/smtp')
export class SmtpSettingsController {
  constructor(private readonly smtp: SmtpSettingsClient) {}

  @Get()
  @RequirePerm('system.config.manage', { scope: 'system' })
  get() {
    return this.smtp.getSettingsView();
  }

  @Put()
  @RequirePerm('system.config.manage', { scope: 'system' })
  update(@Body() dto: UpdateSmtpSettingsDto) {
    return this.smtp.updateSettings(dto);
  }

  @Post('test')
  @RequirePerm('system.config.manage', { scope: 'system' })
  async test(@Body() dto: UpdateSmtpSettingsDto) {
    const view = await this.smtp.testSettings(dto);
    return { ok: true as const, ...view };
  }
}
