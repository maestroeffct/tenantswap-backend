import { IsOptional, IsString } from 'class-validator';

export class UnblockUserDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
