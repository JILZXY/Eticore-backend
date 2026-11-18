import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RoutesProgressService } from './routes-progress.service.js';
import { RoutesController } from './routes.controller.js';
import { RoutesService } from './routes.service.js';

@Module({
  imports: [AuthModule],
  controllers: [RoutesController],
  providers: [RoutesService, RoutesProgressService],
  exports: [RoutesService, RoutesProgressService],
})
export class RoutesModule {}
