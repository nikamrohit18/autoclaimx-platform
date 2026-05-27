import { IsEmail, IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsString()
  @IsNotEmpty()
  tenantSlug!: string;
}

export class OtpRequestDto {
  @IsString()
  @Matches(/^\+?[1-9]\d{6,14}$/, { message: 'phone must be a valid E.164 number' })
  phone!: string;
}

export class OtpVerifyDto {
  @IsString()
  @Matches(/^\+?[1-9]\d{6,14}$/, { message: 'phone must be a valid E.164 number' })
  phone!: string;

  @IsString()
  @Length(6, 6)
  code!: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
