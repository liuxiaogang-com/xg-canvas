import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';

import { CurrentUser, type AuthUser } from '../common/decorators/current-user';
import { RequirePerm } from '../authz/require-perm.decorator';
import { CanvasService } from './canvas.service';
import {
  CreateEdgeDto,
  CreateNodeDto,
  ReplaceCanvasDto,
  UpdateCanvasDto,
  UpdateNodeDto,
} from './dto/canvas.dto';
import { EdgeService } from './edge.service';
import { listNodeSpecs } from './node-spec';
import { NodeService } from './node.service';
import { SnapshotService } from './snapshot.service';

const P = { scope: 'project', from: 'param', key: 'projectId' } as const;

@RequirePerm('project.read', P) // baseline; write methods override with node.edit
@Controller('projects/:projectId/canvas')
export class CanvasController {
  constructor(
    private readonly canvases: CanvasService,
    private readonly nodes: NodeService,
    private readonly edges: EdgeService,
    private readonly snapshots: SnapshotService,
  ) {}

  @Get()
  async fullPayload(@CurrentUser() user: AuthUser, @Param('projectId') projectId: string) {
    return this.canvases.fullPayload(user.user_id, projectId);
  }

  @RequirePerm('project.canvas.node.edit', P)
  @Patch()
  async update(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateCanvasDto,
  ) {
    const c = await this.canvases.getOrCreate(user.user_id, projectId);
    return this.canvases.update(user.user_id, c.id, dto);
  }

  @RequirePerm('project.canvas.node.edit', P)
  @Put('replace')
  async replace(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Body() dto: ReplaceCanvasDto,
  ) {
    const c = await this.canvases.getOrCreate(user.user_id, projectId);
    return this.canvases.replace(user.user_id, c.id, dto);
  }

  @RequirePerm('project.canvas.node.edit', P)
  @Post('nodes')
  async createNode(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateNodeDto,
  ) {
    const c = await this.canvases.getOrCreate(user.user_id, projectId);
    return this.nodes.create(user.user_id, c.id, dto);
  }

  @RequirePerm('project.canvas.node.edit', P)
  @Patch('nodes/:nodeId')
  async updateNode(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('nodeId') nodeId: string,
    @Body() dto: UpdateNodeDto,
  ) {
    const c = await this.canvases.getOrCreate(user.user_id, projectId);
    return this.nodes.update(user.user_id, c.id, nodeId, dto);
  }

  @RequirePerm('project.canvas.node.edit', P)
  @Delete('nodes/:nodeId')
  @HttpCode(204)
  async removeNode(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('nodeId') nodeId: string,
  ) {
    const c = await this.canvases.getOrCreate(user.user_id, projectId);
    await this.nodes.remove(user.user_id, c.id, nodeId);
  }

  @RequirePerm('project.canvas.node.edit', P)
  @Post('edges')
  async createEdge(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Body() dto: CreateEdgeDto,
  ) {
    const c = await this.canvases.getOrCreate(user.user_id, projectId);
    return this.edges.create(user.user_id, c.id, dto);
  }

  @RequirePerm('project.canvas.node.edit', P)
  @Delete('edges/:edgeId')
  @HttpCode(204)
  async removeEdge(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('edgeId') edgeId: string,
  ) {
    const c = await this.canvases.getOrCreate(user.user_id, projectId);
    await this.edges.remove(user.user_id, c.id, edgeId);
  }

  @RequirePerm('project.canvas.node.edit', P)
  @Post('snapshots')
  async createSnapshot(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
  ) {
    const c = await this.canvases.getOrCreate(user.user_id, projectId);
    return this.snapshots.create(user.user_id, c.id);
  }

  @Get('snapshots')
  async listSnapshots(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
  ) {
    const c = await this.canvases.getOrCreate(user.user_id, projectId);
    return this.snapshots.list(user.user_id, c.id);
  }

  @RequirePerm('project.canvas.node.edit', P)
  @Post('snapshots/:snapshotId/restore')
  async restoreSnapshot(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('snapshotId') snapshotId: string,
  ) {
    const c = await this.canvases.getOrCreate(user.user_id, projectId);
    return this.snapshots.restore(user.user_id, c.id, snapshotId);
  }

  @Get('node-specs')
  nodeSpecs() {
    return listNodeSpecs();
  }
}
