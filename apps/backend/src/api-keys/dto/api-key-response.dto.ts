import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiKeyResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'My Development Key' })
  name: string;

  @ApiPropertyOptional({ example: 'Used for CI/CD pipeline integration' })
  description?: string;

  @ApiProperty({ example: 'bst_a1b2...c3d4', description: 'Masked key showing only first 8 chars' })
  maskedKey: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiPropertyOptional({ example: '2025-06-01T00:00:00.000Z' })
  lastUsedAt?: Date;
}

export class ApiKeyCreatedResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'My Development Key' })
  name: string;

  @ApiProperty({ example: 'bst_abc123def456...' })
  apiKey: string;

  @ApiProperty({ description: 'Store this securely. It will not be shown again.' })
  warning: string;
}
