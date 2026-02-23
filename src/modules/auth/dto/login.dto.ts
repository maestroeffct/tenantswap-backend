import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class LoginDto {
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') {
      return value;
    }

    const cleaned = value.replace(/[\s()-]/g, '');
    if (cleaned.startsWith('00')) {
      return `+${cleaned.slice(2)}`;
    }

    return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phone must be in international E.164 format',
  })
  phone: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}
