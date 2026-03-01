import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';
import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMySubscription(@CurrentUser() user: CurrentUserPayload) {
    return this.billingService.getMySubscription(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('checkout')
  createCheckout(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.billingService.createCheckout(user.id, dto);
  }

  @Post('webhook')
  processWebhook(
    @Body() dto: PaymentWebhookDto,
    @Headers('x-payment-webhook-secret') webhookSecret?: string,
  ) {
    return this.billingService.handleWebhook(dto, webhookSecret);
  }
}
