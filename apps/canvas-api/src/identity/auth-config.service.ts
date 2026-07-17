import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EmailSenderService } from './email-sender.service';

export interface AuthConfig {
  methods: string[]; // password | email_code | phone_code | wechat | feishu
}

/** Which real login methods the frontend should show, derived from env. */
@Injectable()
export class AuthConfigService {
  constructor(
    private readonly config: ConfigService,
    private readonly emailSender: EmailSenderService,
  ) {}

  private flag(name: string, def: boolean): boolean {
    const v = this.config.get<string>(name);
    if (v === undefined || v === '') return def;
    return v === 'true' || v === '1';
  }

  private has(name: string): boolean {
    return !!this.config.get<string>(name);
  }

  get wechatEnabled(): boolean {
    return this.has('WECHAT_MP_APPID') || this.has('WECHAT_OA_APPID') || this.has('WECHAT_OPEN_APPID');
  }

  get feishuEnabled(): boolean {
    return this.has('FEISHU_APP_ID');
  }

  methods(): string[] {
    const m: string[] = [];
    if (this.flag('AUTH_PASSWORD_ENABLED', true)) m.push('password');
    const emailRequested = this.flag('AUTH_EMAIL_CODE_ENABLED', this.emailSender.enabled);
    const emailUsable = this.emailSender.enabled || this.config.get<string>('NODE_ENV') !== 'production';
    if (emailRequested && emailUsable) m.push('email_code');
    // Do not advertise phone_code until a real SMS delivery adapter exists.
    // Returning `sent: true` without delivery would create an unusable login UI.
    if (this.wechatEnabled) m.push('wechat');
    if (this.feishuEnabled) m.push('feishu');
    return m;
  }

  snapshot(): AuthConfig {
    return { methods: this.methods() };
  }
}
