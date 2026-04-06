import { IsString } from 'class-validator';

export class SendToUserDto {
  @IsString()
  userId: string;

  @IsString()
  title: string;

  @IsString()
  body: string;
}
