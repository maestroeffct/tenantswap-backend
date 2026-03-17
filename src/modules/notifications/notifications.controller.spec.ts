import { Test, TestingModule } from '@nestjs/testing';

import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  const notificationsServiceMock = {
    getUnreadCount: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        {
          provide: NotificationsService,
          useValue: notificationsServiceMock,
        },
      ],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
    notificationsServiceMock.getUnreadCount.mockReset();
  });

  it('delegates unread count lookup', async () => {
    notificationsServiceMock.getUnreadCount.mockResolvedValue({
      message: 'Unread notification count fetched successfully',
      unreadCount: 3,
    });

    await controller.getUnreadCount({ id: 'user-1' } as any);

    expect(notificationsServiceMock.getUnreadCount).toHaveBeenCalledWith('user-1');
  });
});
