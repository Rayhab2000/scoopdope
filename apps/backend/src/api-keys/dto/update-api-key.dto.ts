import { IsString, MinLength, MaxLength, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateApiKeyDto {
  @ApiPropertyOptional({ description: 'Updated label for the API key', example: 'Updated Key Name' })
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: 'Updated description of the key\'s purpose', example: 'New description for this key' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}
