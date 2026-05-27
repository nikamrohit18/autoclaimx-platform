import { IsBoolean, IsEnum, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateTenantDto {
  @IsString() @MinLength(2) @IsOptional() name?: string;
  @IsEnum(['STARTER', 'PROFESSIONAL', 'ENTERPRISE']) @IsOptional() plan?: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
  @IsBoolean() @IsOptional() active?: boolean;
  @IsObject() @IsOptional() config?: Record<string, unknown>;
}
