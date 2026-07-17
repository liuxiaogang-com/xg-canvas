import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SessionGuard } from './auth/session.guard';
import { AuthzModule } from './authz/authz.module';
import { PermissionGuard } from './authz/permission.guard';
import { AccountClientModule } from './account-client/account-client.module';
import { AccountModule } from './account/account.module';
import { ModelCredential } from './account/credential/credential.entity';
import {
  FeatureModelBinding,
  FeatureModelConfig,
} from './account/feature-config/feature-config.entity';
import { SystemSetting } from './account/storage/system-setting.entity';
import { CATALOG_ENTITIES } from './account/catalog/catalog.entities';
import { ProviderInstallation } from './account/provider/provider-installation.entity';
import { ChannelInstallation } from './account/channel/channel-installation.entity';
import { ModelSettings } from './account/model-definition/model-settings.entity';
import { RequestLog } from './request-log/request-log.entity';
import { AssetModule } from './asset/asset.module';
import { AuthModule } from './auth/auth.module';
import { AgentModule } from './agent/agent.module';
import { BillingModule } from './billing/billing.module';
import { CanvasModule } from './canvas/canvas.module';
import { ChatModule } from './chat/chat.module';
import { IdentityModule } from './identity/identity.module';
import {
  Asset,
  AssetUploadDraft,
  Favorite,
  LibraryEntry,
  AuthDevice,
  AuthIdentity,
  AuthSession,
  AuthzAudit,
  Permission,
  Role,
  RoleBinding,
  RolePermission,
  VerificationChallenge,
  Canvas,
  CanvasEdge,
  CanvasEntity,
  CanvasNode,
  CanvasSnapshot,
  Conversation,
  Message,
  Project,
  PromptPreset,
  Task,
  User,
  Workspace,
  WorkspaceMember,
} from './database/entities';
import { EntityModule } from './entity/entity.module';
import { FavoriteModule } from './favorite/favorite.module';
import { LibraryModule } from './library/library.module';
import { ScriptModule } from './script/script.module';
import { HealthModule } from './health/health.module';
import { InstanceReadinessModule } from './instance-readiness/instance-readiness.module';
import { ModelsModule } from './models/models.module';
import { PresetModule } from './preset/preset.module';
import { ProjectModule } from './project/project.module';
import { RedisModule } from './redis/redis.module';
import { RequestLogModule } from './request-log/request-log.module';
import { StatsModule } from './stats/stats.module';
import { StorageModule } from './storage/storage.module';
import { TaskModule } from './task/task.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { SetupModule } from './setup/setup.module';
import { SetupGuard } from './setup/setup.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env', '../../../.env'] }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        url: config.get('DATABASE_URL', 'postgresql://xgcanvas:xgcanvas@localhost:5432/xgcanvas'),
        schema: 'canvas',
        entities: [
          User,
          Workspace,
          WorkspaceMember,
          Project,
          Task,
          Asset,
          AssetUploadDraft,
          Favorite,
          LibraryEntry,
          PromptPreset,
          Canvas,
          CanvasNode,
          CanvasEdge,
          CanvasSnapshot,
          CanvasEntity,
          Conversation,
          Message,
          AuthDevice,
          AuthSession,
          AuthIdentity,
          VerificationChallenge,
          Permission,
          Role,
          RolePermission,
          RoleBinding,
          AuthzAudit,
          // account schema (M6): explicit @Entity({schema:'account'}) overrides the
          // connection default 'canvas', so one connection serves both schemas.
          ModelCredential,
          ProviderInstallation,
          ChannelInstallation,
          ModelSettings,
          FeatureModelConfig,
          FeatureModelBinding,
          SystemSetting,
          ...CATALOG_ENTITIES,
          // ops schema — vendor request observability log
          RequestLog,
        ],
        synchronize: false,
        logging: config.get('NODE_ENV') === 'development',
      }),
    }),
    RedisModule,
    StorageModule,
    AccountClientModule,
    AccountModule,
    HealthModule,
    AuthModule,
    SetupModule,
    WorkspaceModule,
    ProjectModule,
    TaskModule,
    AssetModule,
    CanvasModule,
    ChatModule,
    IdentityModule,
    EntityModule,
    FavoriteModule,
    LibraryModule,
    InstanceReadinessModule,
    ScriptModule,
    AgentModule,
    PresetModule,
    ModelsModule,
    StatsModule,
    RequestLogModule,
    BillingModule,
    AuthzModule,
  ],
  // Order matters: SessionGuard authenticates (sets req.user), then PermissionGuard
  // enforces @RequirePerm. Routes without @RequirePerm pass the second guard.
  providers: [
    { provide: APP_GUARD, useExisting: SetupGuard },
    { provide: APP_GUARD, useExisting: SessionGuard },
    { provide: APP_GUARD, useExisting: PermissionGuard },
  ],
})
export class AppModule {}
