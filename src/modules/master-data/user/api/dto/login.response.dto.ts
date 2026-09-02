import { Expose, Type } from 'class-transformer';

class LoginUserDto {
  @Expose() id!: string;
  @Expose() tenantId!: string;
  @Expose() email!: string;
  @Expose() displayName!: string;
  @Expose() roleIds!: readonly string[];
}

export class LoginResponseDto {
  @Expose() accessToken!: string;

  @Expose()
  @Type(() => LoginUserDto)
  user!: LoginUserDto;
}
