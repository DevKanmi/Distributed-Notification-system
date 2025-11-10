import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsString, MaxLength } from 'class-validator';

export class RenderTemplateDto {
  @ApiProperty({ example: 'welcome_email', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  template_code: string;

  @ApiProperty({ example: 'en', maxLength: 10 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  language: string;

  @ApiProperty({
    example: { name: 'John Doe', link: 'https://example.com/activate' },
    description: 'Variables to substitute in the template',
  })
  @IsObject()
  variables: Record<string, unknown>;
}
