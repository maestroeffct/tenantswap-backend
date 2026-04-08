import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class SubmitCaretakerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  caretakerName: string;

  @IsString()
  @Matches(/^\+?[0-9\s\-]{7,20}$/, { message: 'Invalid phone number' })
  caretakerPhone: string;
}
