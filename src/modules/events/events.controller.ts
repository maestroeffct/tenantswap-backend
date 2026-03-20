import { Controller, Header, Sse, UseGuards } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt.guard';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @UseGuards(JwtAuthGuard)
  @Header('Cache-Control', 'no-cache')
  @Header('Connection', 'keep-alive')
  @Sse('stream')
  stream(@CurrentUser() user: CurrentUserPayload): Observable<MessageEvent> {
    return this.eventsService.createUserStream(user.id);
  }
}
