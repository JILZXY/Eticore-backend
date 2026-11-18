import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GamificationModule } from '../gamification/gamification.module.js';
import { AttemptsFinalizationService } from './attempts-finalization.service.js';
import { AttemptsStepService } from './attempts-step.service.js';
import { AttemptsController } from './attempts.controller.js';
import { AttemptsService } from './attempts.service.js';

@Module({
  imports: [AuthModule, GamificationModule],
  controllers: [AttemptsController],
  providers: [
    AttemptsService,
    AttemptsStepService,
    AttemptsFinalizationService,
  ],
  exports: [AttemptsService],
})
export class AttemptsModule {}
