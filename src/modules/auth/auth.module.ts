import { Module } from '@nestjs/common';
import { AuthRateLimitGuard } from '../../common/guards/auth-rate-limit.guard.js';
import { OwnershipGuard } from '../../common/guards/ownership.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard.js';
import { AuthDatabaseModule } from '../../database/auth-database.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { TotpChallengeService } from './totp-challenge.service.js';
import { TotpSetupService } from './totp-setup.service.js';

@Module({
  imports: [AuthDatabaseModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    TotpSetupService,
    TotpChallengeService,
    SessionAuthGuard,
    RolesGuard,
    OwnershipGuard,
    AuthRateLimitGuard,
  ],
  exports: [
    AuthService,
    TotpSetupService,
    TotpChallengeService,
    SessionAuthGuard,
    RolesGuard,
    OwnershipGuard,
    AuthRateLimitGuard,
  ],
})
export class AuthModule {}
