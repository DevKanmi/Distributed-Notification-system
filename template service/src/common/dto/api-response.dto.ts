import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationMeta {
  @ApiProperty()
  total: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  total_pages: number;

  @ApiProperty()
  has_next: boolean;

  @ApiProperty()
  has_previous: boolean;
}

export class ApiResponse<T> {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  message: string;

  @ApiPropertyOptional()
  data?: T;

  @ApiPropertyOptional()
  error?: string;

  @ApiPropertyOptional({ type: PaginationMeta })
  meta?: PaginationMeta;
}
