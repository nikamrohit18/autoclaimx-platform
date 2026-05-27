import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateTenantDto {
  @IsString() @MinLength(2) name!: string;
  @IsString() @MinLength(2) slug!: string;
  @IsEnum(['STARTER', 'PROFESSIONAL', 'ENTERPRISE']) @IsOptional() plan?: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
}
