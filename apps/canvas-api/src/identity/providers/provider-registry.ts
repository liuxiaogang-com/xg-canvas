import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthConfigService } from '../auth-config.service';
import { FeishuProvider } from './feishu.provider';
import type { IdentityProvider } from './identity-provider.interface';
import { MockProvider } from './mock.provider';
import { WeChatProvider } from './wechat.provider';

/**
 * Builds the live provider set from env at boot. A provider appears only once
 * its creds are present; the dev `mock` provider is added when mock is enabled.
 * Adding e.g. enterprise WeChat = one provider file + one env block here.
 */
@Injectable()
export class ProviderRegistry {
  private readonly providers = new Map<string, IdentityProvider>();

  constructor(config: ConfigService, authConfig: AuthConfigService) {
    const externalCallbacksReady = !!config.get<string>('PUBLIC_BASE_URL')?.trim();
    const oaAppid = config.get<string>('WECHAT_OA_APPID');
    const oaSecret = config.get<string>('WECHAT_OA_SECRET');
    if (externalCallbacksReady && oaAppid && oaSecret) {
      this.add(
        new WeChatProvider('wechat_oa', {
          appid: oaAppid,
          secret: oaSecret,
          scope: 'snsapi_userinfo',
          authorizeBase: 'https://open.weixin.qq.com/connect/oauth2/authorize',
        }),
      );
    }
    const openAppid = config.get<string>('WECHAT_OPEN_APPID');
    const openSecret = config.get<string>('WECHAT_OPEN_SECRET');
    if (externalCallbacksReady && openAppid && openSecret) {
      this.add(
        new WeChatProvider('wechat_open', {
          appid: openAppid,
          secret: openSecret,
          scope: 'snsapi_login',
          authorizeBase: 'https://open.weixin.qq.com/connect/qrconnect',
        }),
      );
    }
    const fsId = config.get<string>('FEISHU_APP_ID');
    const fsSecret = config.get<string>('FEISHU_APP_SECRET');
    if (externalCallbacksReady && fsId && fsSecret) this.add(new FeishuProvider(fsId, fsSecret));

    if (authConfig.mockEnabled) this.add(new MockProvider());
  }

  private add(p: IdentityProvider): void {
    this.providers.set(p.key, p);
  }

  get(key: string): IdentityProvider | null {
    return this.providers.get(key) ?? null;
  }

  keys(): string[] {
    return [...this.providers.keys()];
  }
}
