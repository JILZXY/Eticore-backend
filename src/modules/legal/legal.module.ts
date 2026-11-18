import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LegalController } from './legal.controller.js';
import { LegalService } from './legal.service.js';

@Module({
  imports: [AuthModule],
  controllers: [LegalController],
  providers: [LegalService],
  exports: [LegalService],
})
export class LegalModule {}
