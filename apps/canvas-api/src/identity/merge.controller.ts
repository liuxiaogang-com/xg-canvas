import { BadRequestException, Body, Controller, HttpCode, NotFoundException, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CurrentUser, type AuthUser } from '../common/decorators/current-user';
import { Keys } from '../redis/keys';
import { RedisService } from '../redis/redis.service';
import { ConfirmCodeDto, MergeContactDto } from './dto/merge.dto';
import { IdentityService } from './identity.service';
import { MergeService } from './merge.service';
import { normalizeEmail, normalizePhone } from './normalize';
import { VerificationService } from './verification.service';

interface OAuthPending {
  provider: string;
  providerUid: string;
}

/**
 * Account re-bind / merge. Both flows require a fresh merge_confirm code on the
 * contact being acted on, proving the caller controls it (anti-hijack).
 * Contact-based for now; OAuth force-bind reuses the same MergeService.
 */
@ApiTags('account')
@Controller('me/account')
export class MergeController {
  constructor(
    private readonly verification: VerificationService,
    private readonly merge: MergeService,
    private readonly identity: IdentityService,
    private readonly redis: RedisService,
  ) {}

  /** Send a merge_confirm code to the contact you intend to steal/merge. */
  @Post('confirm-code')
  @HttpCode(200)
  sendConfirmCode(@CurrentUser() user: AuthUser, @Body() dto: ConfirmCodeDto) {
    return this.verification.sendCode(dto.channel, dto.target, 'merge_confirm', user.user_id);
  }

  /** Steal a single contact identity into my account (the other account survives). */
  @Post('force-bind')
  @HttpCode(204)
  async forceBind(@CurrentUser() user: AuthUser, @Body() dto: MergeContactDto): Promise<void> {
    const uid = await this.proveContact(user, dto);
    await this.merge.forceBind(user.user_id, dto.channel, uid);
  }

  /** Absorb the account that owns this contact (only if it has no assets). */
  @Post('merge')
  @HttpCode(204)
  async mergeAccount(@CurrentUser() user: AuthUser, @Body() dto: MergeContactDto): Promise<void> {
    const uid = await this.proveContact(user, dto);
    const targetUserId = await this.identity.findUserByIdentity(dto.channel, uid);
    if (!targetUserId) throw new NotFoundException({ code: 'NOT_FOUND', message: '该登录方式不存在' });
    await this.merge.fullMerge(user.user_id, targetUserId);
  }

  /** Steal an OAuth identity (proven via the prior bind redirect, stashed pending). */
  @Post('oauth/force-bind')
  @HttpCode(204)
  async oauthForceBind(@CurrentUser() user: AuthUser): Promise<void> {
    const p = await this.takePending(user.user_id);
    await this.merge.forceBind(user.user_id, p.provider, p.providerUid);
  }

  /** Merge the account that owns the proven OAuth identity (no-asset only). */
  @Post('oauth/merge')
  @HttpCode(204)
  async oauthMerge(@CurrentUser() user: AuthUser): Promise<void> {
    const p = await this.takePending(user.user_id);
    const targetUserId = await this.identity.findUserByIdentity(p.provider, p.providerUid);
    if (!targetUserId) throw new NotFoundException({ code: 'NOT_FOUND', message: '该登录方式不存在' });
    await this.merge.fullMerge(user.user_id, targetUserId);
  }

  /** Verify the merge_confirm code and return the normalized contact uid. */
  private async proveContact(_user: AuthUser, dto: MergeContactDto): Promise<string> {
    const r = await this.verification.verifyCode(dto.channel, dto.target, 'merge_confirm', dto.code);
    if (!r.ok) throw new BadRequestException({ code: 'INVALID_CODE', message: '验证码无效或已过期' });
    return dto.channel === 'email' ? normalizeEmail(dto.target) : normalizePhone(dto.target);
  }

  /** Read + consume the stashed OAuth-bind-conflict identity (proof from the redirect). */
  private async takePending(userId: string): Promise<OAuthPending> {
    const raw = await this.redis.get(Keys.oauthPending(userId));
    if (!raw) throw new BadRequestException({ code: 'NO_PENDING', message: '请先重新发起第三方绑定' });
    await this.redis.del(Keys.oauthPending(userId));
    return JSON.parse(raw) as OAuthPending;
  }
}
