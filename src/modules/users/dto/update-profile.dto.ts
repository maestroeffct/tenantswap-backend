import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
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

export class UpdateProfileDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

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
  @IsOptional()
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phone must be in international E.164 format',
  })
  phone?: string;

  @Transform(({ value }: { value: unknown }) => toBoolean(value))
  @IsOptional()
  @IsBoolean()
  canConnectLandlord?: boolean;

  @Transform(({ value }: { value: unknown }) => toBoolean(value))
  @IsOptional()
  @IsBoolean()
  hasLandlordContact?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  currentPassword?: string;
}
