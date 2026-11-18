import { SetMetadata } from '@nestjs/common';

export const ALLOW_UNVERIFIED_2FA_KEY = 'allowUnverified2fa';
export const AllowUnverified2fa = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOW_UNVERIFIED_2FA_KEY, true);
