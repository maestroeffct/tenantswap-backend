import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  fullName: string;

  @IsString()
  phone: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsIn(['USER', 'SUPPORT', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN'])
  role?: string;
}
