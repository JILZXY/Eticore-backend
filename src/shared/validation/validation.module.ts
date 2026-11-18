import { Global, Module } from '@nestjs/common';
import { ContentValidatorService } from './content-validator.service.js';
import { ScoringService } from './scoring.service.js';

@Global()
@Module({
  providers: [ContentValidatorService, ScoringService],
  exports: [ContentValidatorService, ScoringService],
})
export class ValidationModule {}
