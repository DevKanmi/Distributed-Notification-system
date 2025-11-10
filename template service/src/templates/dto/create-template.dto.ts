import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateTemplateDto {
  @ApiProperty({
    example: 'welcome_email',
    maxLength: 100,
    description:
      'Unique template code (lowercase letters, numbers, underscores only)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  @Matches(/^[a-z0-9_]+$/, {
    message:
      'code must contain only lowercase letters, numbers, and underscores',
  })
  code: string;

  @ApiProperty({ example: 'Welcome Email', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'Sent to new users upon registration' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 'en', maxLength: 10 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  language: string;

  @ApiProperty({ example: 'Welcome to {{name}}!', maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  subject: string;

  @ApiProperty({
    example: '<h1>Hi {{name}}</h1><p>Click <a href="{{link}}">here</a></p>',
  })
  @IsString()
  @IsNotEmpty()
  body: string;
}
