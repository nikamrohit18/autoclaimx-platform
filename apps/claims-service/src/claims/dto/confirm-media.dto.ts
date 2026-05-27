import { IsNumber, IsString, Min } from 'class-validator';

export class ConfirmMediaUploadDto {
  @IsString() mediaAssetId!: string;
  @IsString() s3Key!: string;
  @IsNumber() @Min(1) sizeBytes!: number;
  @IsString() contentType!: string;
}
