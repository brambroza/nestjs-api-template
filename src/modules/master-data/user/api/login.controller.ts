import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { LoginUseCase } from '../application/login.use-case';

import { LoginRequestDto } from './dto/login.request.dto';
import { LoginResponseDto } from './dto/login.response.dto';

/**
 * Not guarded — this is where authentication starts. Returns a Bearer
 * token the client then passes on every subsequent request.
 */
@ApiTags('auth')
@Controller('auth')
export class LoginController {
  constructor(private readonly login: LoginUseCase) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange email + password for an access token' })
  async loginEndpoint(
    @Body() body: LoginRequestDto,
  ): Promise<LoginResponseDto> {
    const result = await this.login.execute({
      tenantId: body.tenantId,
      email: body.email,
      password: body.password,
    });
    const dto = new LoginResponseDto();
    dto.accessToken = result.accessToken;
    dto.user = { ...result.user };
    return dto;
  }
}
