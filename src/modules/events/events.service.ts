import { Injectable } from '@nestjs/common';
import { Observable, Subject, interval, merge, of } from 'rxjs';
import { filter, finalize, map } from 'rxjs/operators';
import type { MessageEvent } from '@nestjs/common';

type LiveEventPayload = Record<string, unknown>;

type LiveEvent = {
  type: string;
  data: LiveEventPayload;
};

@Injectable()
export class EventsService {
  private readonly stream = new Subject<{ userId: string; event: LiveEvent }>();
  private readonly connectionCounts = new Map<string, number>();

  createUserStream(userId: string): Observable<MessageEvent> {
    this.connectionCounts.set(userId, (this.connectionCounts.get(userId) ?? 0) + 1);

    const connectedEvent = of<MessageEvent>({
      type: 'connected',
      data: {
        type: 'connected',
        userId,
        connectedAt: new Date().toISOString(),
      },
    });

    const heartbeat$ = interval(25_000).pipe(
      map(
        (): MessageEvent => ({
          type: 'heartbeat',
          data: {
            type: 'heartbeat',
            timestamp: new Date().toISOString(),
          },
        }),
      ),
    );

    const userEvents$ = this.stream.pipe(
      filter((entry) => entry.userId === userId),
      map(
        ({ event }): MessageEvent => ({
          type: event.type,
          data: {
            type: event.type,
            ...event.data,
          },
        }),
      ),
    );

    return merge(connectedEvent, heartbeat$, userEvents$).pipe(
      finalize(() => {
        const remaining = (this.connectionCounts.get(userId) ?? 1) - 1;
        if (remaining <= 0) {
          this.connectionCounts.delete(userId);
          return;
        }

        this.connectionCounts.set(userId, remaining);
      }),
    );
  }

  emitToUser(userId: string, type: string, data: LiveEventPayload = {}) {
    if ((this.connectionCounts.get(userId) ?? 0) === 0) {
      return;
    }

    this.stream.next({
      userId,
      event: { type, data },
    });
  }
}
