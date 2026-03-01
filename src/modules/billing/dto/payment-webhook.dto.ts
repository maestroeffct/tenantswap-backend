import { IsObject, IsOptional, IsString } from 'class-validator';

export class PaymentWebhookDto {
  @IsOptional()
  @IsString()
  provider?: string;

  @IsString()
  eventId: string;

  @IsString()
  type: string;

  @IsObject()
  data: Record<string, unknown>;
}
