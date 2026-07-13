import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';

import { RequirePerm } from '../authz/require-perm.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user';
import { CreateLibraryEntryDto, UpdateLibraryEntryDto } from './library.dto';
import { presentLibraryEntry } from './library.presenter';
import { LibraryService } from './library.service';

const VIEW = { scope: 'project', from: 'query', key: 'project_id', optional: true } as const;
const CREATE = { scope: 'project', from: 'body', key: 'project_id', optional: true } as const;

@Controller('library')
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get()
  @RequirePerm('project.library.view', VIEW)
  async list(
    @CurrentUser() user: AuthUser,
    @Query('kind') kind?: string,
    @Query('project_id') projectId?: string,
    @Query('q') q?: string,
    @Query('tags') tags?: string,
    @Query('favorited') favorited?: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    const entries = await this.library.list(user.user_id, {
      workspace_id: user.workspace_id,
      kind,
      project_id: projectId,
      q,
      tags: tags ? tags.split(',').filter(Boolean) : undefined,
      favorited: favorited === 'true',
      limit: parseLimit(limit),
      before,
    });
    return entries.map(presentLibraryEntry);
  }

  @Get(':id')
  async detail(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    // Read authorization happens inside getOrThrow (visibility-aware).
    return presentLibraryEntry(await this.library.getOrThrow(user.user_id, id, user.workspace_id));
  }

  @Post()
  @RequirePerm('project.library.create', CREATE)
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateLibraryEntryDto) {
    return presentLibraryEntry(await this.library.create(user.user_id, user.workspace_id, dto));
  }

  @Patch(':id')
  async update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLibraryEntryDto) {
    return presentLibraryEntry(await this.library.update(user.user_id, user.workspace_id, id, dto));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.library.softDelete(user.user_id, user.workspace_id, id);
  }
}

function parseLimit(raw?: string): number | undefined {
  if (raw == null || raw === '') return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 200) {
    throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'limit must be an integer from 1 to 200' });
  }
  return value;
}
