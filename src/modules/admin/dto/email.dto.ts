import { IsString, IsOptional, IsBoolean, IsIn, IsEmail } from 'class-validator';

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
  @IsIn(['user', 'all_users', 'caretakers', 'subscribed', 'unsubscribed'])
  target!: 'user' | 'all_users' | 'caretakers' | 'subscribed' | 'unsubscribed';

  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() templateSlug?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() bodyHtml?: string;
  @IsOptional() @IsString() bodyText?: string;
}
