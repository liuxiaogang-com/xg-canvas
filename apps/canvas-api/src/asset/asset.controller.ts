import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { AssetType } from '@xgcanvas/shared-types';

import { RequirePerm } from '../authz/require-perm.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user';
import { PresignedUrlService } from '../storage/presigned-url.service';
import { BatchUrlsDto, CompleteUploadDto, CopyToProjectDto, UploadIntentDto } from './asset.dto';
import { AssetService } from './asset.service';
import { AssetUploadService } from './asset-upload.service';

// project_id is optional on list/upload (null-project / personal assets are
// gated by membership + visibility); required on copy (writing into a project).
const VIEW = { scope: 'project', from: 'query', key: 'project_id', optional: true } as const;
const CREATE = { scope: 'project', from: 'body', key: 'project_id' } as const;
const CREATE_OPTIONAL = { scope: 'project', from: 'body', key: 'project_id', optional: true } as const;

const DEFAULT_READ_TTL = 900;

@Controller('assets')
export class AssetController {
  constructor(
    private readonly assets: AssetService,
    private readonly uploads: AssetUploadService,
    private readonly urls: PresignedUrlService,
  ) {}

  @Get()
  @RequirePerm('project.asset.view', VIEW)
  list(
    @CurrentUser() user: AuthUser,
    @Query('project_id') projectId?: string,
    @Query('type') type?: AssetType,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
    @Query('owner') owner?: string,
    @Query('favorited') favorited?: string,
    @Query('tags') tags?: string,
    @Query('source') source?: string,
    @Query('q') q?: string,
  ) {
    return this.assets.list(user.user_id, {
      workspace_id: user.workspace_id,
      project_id: projectId,
      type,
      limit: limit ? Number(limit) : undefined,
      before,
      owner: owner === 'me' ? 'me' : undefined,
      favorited: favorited === 'true',
      tags: tags ? tags.split(',').filter(Boolean) : undefined,
      source: source === 'upload' || source === 'task' ? source : undefined,
      q,
    });
  }

  /** Batch presigned GET urls; unauthorized ids are silently omitted. */
  @Post('urls')
  async batchUrls(@CurrentUser() user: AuthUser, @Body() dto: BatchUrlsDto) {
    const ttl = dto.ttl ?? DEFAULT_READ_TTL;
    const readable = await this.assets.listReadable(user.user_id, dto.ids, user.workspace_id);
    const urls: Record<string, string> = {};
    await Promise.all(
      readable.map(async (a) => {
        urls[a.id] = await this.urls.getObject(a.thumb_storage_key ?? a.storage_key, ttl);
      }),
    );
    return { urls, expires_in: ttl };
  }

  @Post('upload-intent')
  @RequirePerm('project.asset.create', CREATE_OPTIONAL)
  uploadIntent(@CurrentUser() user: AuthUser, @Body() dto: UploadIntentDto) {
    return this.uploads.createIntent(user.user_id, user.workspace_id, dto);
  }

  @Post('uploads/:draftId/complete')
  complete(@CurrentUser() user: AuthUser, @Param('draftId', ParseUUIDPipe) draftId: string, @Body() dto: CompleteUploadDto) {
    return this.uploads.complete(user.user_id, draftId, dto);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    // Read authorization happens inside getOrThrow (visibility-aware).
    return this.assets.getOrThrow(user.user_id, id, user.workspace_id);
  }

  @Get(':id/url')
  async url(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('ttl') ttl?: string,
    @Query('variant') variant?: string,
  ) {
    const a = await this.assets.getOrThrow(user.user_id, id, user.workspace_id);
    const ttlSec = parseReadTtl(ttl);
    const wantThumb = variant === 'thumb';
    if (wantThumb) {
      if (!a.thumb_storage_key) {
        throw new NotFoundException({ code: 'THUMB_NOT_FOUND', message: 'asset has no thumbnail' });
      }
      const url = await this.urls.getObject(a.thumb_storage_key, ttlSec);
      return { url, expires_in: ttlSec, variant: 'thumb' as const };
    }
    const url = await this.urls.getObject(a.storage_key, ttlSec);
    return { url, expires_in: ttlSec, variant: 'full' as const };
  }

  @Post(':id/thumbnail-intent')
  thumbnailIntent(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.assets.createThumbnailIntent(user.user_id, user.workspace_id, id);
  }

  @Post(':id/thumbnail-complete')
  thumbnailComplete(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.assets.completeThumbnail(user.user_id, user.workspace_id, id);
  }

  @Post(':id/copy-to-project')
  @RequirePerm('project.asset.create', CREATE)
  copy(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CopyToProjectDto) {
    return this.assets.copyToProject(user.user_id, user.workspace_id, id, dto.project_id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.assets.softDelete(user.user_id, user.workspace_id, id);
  }
}

function parseReadTtl(raw?: string): number {
  if (raw == null || raw === '') return DEFAULT_READ_TTL;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 60 || value > 3600) {
    throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'ttl must be an integer from 60 to 3600' });
  }
  return value;
}
