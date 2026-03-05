import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

function toBoolean(value: unknown): unknown {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }

    if (normalized === 'false') {
      return false;
    }
  }

  return value;
}

export class RegisterDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;

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
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/, {
    message:
      'password must include uppercase, lowercase, number, and special character',
  })
  password: string;

  @Transform(({ value }: { value: unknown }) => toBoolean(value))
  @IsBoolean()
  canConnectLandlord: boolean;

  @Transform(({ value }: { value: unknown }) => toBoolean(value))
  @IsBoolean()
  hasLandlordContact: boolean;
}
