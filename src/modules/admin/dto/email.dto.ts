import { IsString, IsOptional, IsBoolean, IsIn, IsObject, IsArray } from 'class-validator';

export class CreateEmailTemplateDto {
  @IsString() name!: string;
  @IsString() slug!: string;
  @IsString() subject!: string;
  @IsString() bodyHtml!: string;
  @IsOptional() @IsString() bodyText?: string;
  @IsOptional() @IsString() description?: string;
}

export class UpdateEmailTemplateDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() bodyHtml?: string;
  @IsOptional() @IsString() bodyText?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class SendEmailDto {
  @IsIn(['user', 'users', 'all_users', 'caretakers', 'subscribed', 'unsubscribed'])
  target!: 'user' | 'users' | 'all_users' | 'caretakers' | 'subscribed' | 'unsubscribed';

  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) userIds?: string[];
  @IsOptional() @IsString() templateSlug?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() headline?: string;
  @IsOptional() @IsString() bodyHtml?: string;
  @IsOptional() @IsString() bodyText?: string;
  @IsOptional() @IsArray() @IsObject({ each: true }) ctaButtons?: Array<{
    label?: string;
    url?: string;
    variant?: string;
  }>;
  @IsOptional() @IsObject() variables?: Record<string, string>;
}
