import { Global, Module } from '@nestjs/common';
import { ContentValidatorService } from './content-validator.service.js';

@Global()
@Module({
  providers: [ContentValidatorService],
  exports: [ContentValidatorService],
})
export class ValidationModule {}
