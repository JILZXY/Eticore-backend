import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogMuestraController } from './catalog-muestra.controller.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { EditorialDraftService } from './editorial-draft.service.js';
import { EditorialPublishService } from './editorial-publish.service.js';
import { EditorialController } from './editorial.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [
    CatalogController,
    CatalogMuestraController,
    EditorialController,
  ],
  providers: [CatalogService, EditorialDraftService, EditorialPublishService],
  exports: [CatalogService, EditorialDraftService, EditorialPublishService],
})
export class CatalogModule {}
