import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString() @MinLength(2) name!: string;
  @IsEmail() @IsOptional() email?: string;
  @IsString() @IsOptional() phone?: string;
  @IsEnum(['INSURER_ADMIN', 'ADJUSTER', 'WORKSHOP_ADMIN', 'WORKSHOP_STAFF', 'FLEET_ADMIN', 'POLICYHOLDER'])
  role!: string;
  @IsString() @MinLength(8) @IsOptional() password?: string;
  @IsString() @IsOptional() workshopId?: string;
}
