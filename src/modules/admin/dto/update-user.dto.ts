import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsIn(['USER', 'SUPPORT', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN'])
  role?: string;
}
