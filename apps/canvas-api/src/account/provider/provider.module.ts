import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { ProviderInstallation } from './provider-installation.entity';
import { ProviderService } from './provider.service';
import { ProviderController } from './provider.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ProviderInstallation]), CatalogModule],
  controllers: [ProviderController],
  providers: [ProviderService],
  exports: [ProviderService],
})
export class ProviderModule {}
