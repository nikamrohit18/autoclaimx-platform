import { IsString, IsDateString, IsNumber, IsOptional, Min, Max } from 'class-validator';

export class CreateClaimDto {
  @IsString()
  policyNumber!: string;

  @IsString()
  policyHolderId!: string;

  @IsString()
  @IsOptional()
  vehicleVin?: string;

  @IsString()
  vehiclePlate!: string;

  @IsString()
  vehicleMake!: string;

  @IsString()
  vehicleModel!: string;

  @IsNumber()
  @Min(1900)
  @Max(new Date().getFullYear() + 1)
  vehicleYear!: number;

  @IsDateString()
  incidentDate!: string;

  @IsNumber()
  @IsOptional()
  incidentLat?: number;

  @IsNumber()
  @IsOptional()
  incidentLng?: number;

  @IsString()
  @IsOptional()
  incidentAddress?: string;

  @IsString()
  @IsOptional()
  incidentDescription?: string;

  @IsString()
  @IsOptional()
  currency?: string;
}
