import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class AddVersionDto {
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

  @ApiPropertyOptional({ example: false, default: false })
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
