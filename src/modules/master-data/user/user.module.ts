import { Global, Module } from '@nestjs/common';

import { LoginController } from './api/login.controller';
import { LoginUseCase } from './application/login.use-case';
import {
  PASSWORD_HASHER,
  USER_PERMISSIONS,
  USER_REPOSITORY,
} from './application/ports';
import { PrismaUserPermissions } from './infrastructure/prisma-user-permissions';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository';
import { ScryptPasswordHasher } from './infrastructure/scrypt-password-hasher';

/**
 * Global so PoliciesGuard can inject USER_PERMISSIONS without every
 * feature module having to import UserModule explicitly.
 */
@Global()
@Module({
  controllers: [LoginController],
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: PASSWORD_HASHER, useClass: ScryptPasswordHasher },
    { provide: USER_PERMISSIONS, useClass: PrismaUserPermissions },
    LoginUseCase,
  ],
  exports: [USER_PERMISSIONS, USER_REPOSITORY, PASSWORD_HASHER],
})
export class UserModule {}
