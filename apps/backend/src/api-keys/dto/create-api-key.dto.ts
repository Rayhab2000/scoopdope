import { IsString, MinLength, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateApiKeyDto {
  @ApiProperty({ description: 'A human-readable label for the API key', example: 'My Development Key' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: 'Optional description of the key\'s purpose', example: 'Used for CI/CD pipeline integration' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}
