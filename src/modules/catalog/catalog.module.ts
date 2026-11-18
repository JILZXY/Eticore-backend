import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogMuestraController } from './catalog-muestra.controller.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';

@Module({
  imports: [AuthModule],
  controllers: [CatalogController, CatalogMuestraController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
