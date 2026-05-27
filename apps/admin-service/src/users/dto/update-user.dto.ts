import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUserDto {
  @IsString() @MinLength(2) @IsOptional() name?: string;
  @IsEnum(['INSURER_ADMIN', 'ADJUSTER', 'WORKSHOP_ADMIN', 'WORKSHOP_STAFF', 'FLEET_ADMIN', 'POLICYHOLDER'])
  @IsOptional() role?: string;
  @IsBoolean() @IsOptional() active?: boolean;
  @IsString() @IsOptional() workshopId?: string;
}
