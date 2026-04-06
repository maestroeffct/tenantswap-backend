import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreatePushNotificationDto {
  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  zone?: string;

  @IsOptional()
  @IsIn(['ALL_USERS', 'SEEKERS', 'SWAPPERS', 'VERIFIED_USERS', 'SPECIFIC_USER'])
  target?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  scheduledAt?: string;
}
