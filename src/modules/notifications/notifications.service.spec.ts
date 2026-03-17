import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  const prismaMock = {
    userNotification: {
      count: jest.fn(),
    },
  } as any;

  let service: NotificationsService;

  beforeEach(() => {
    prismaMock.userNotification.count.mockReset();
    service = new NotificationsService(prismaMock);
  });

  it('returns unread count for a user', async () => {
    prismaMock.userNotification.count.mockResolvedValue(4);

    const result = await service.getUnreadCount('user-1');

    expect(prismaMock.userNotification.count).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        readAt: null,
      },
    });
    expect(result).toEqual({
      message: 'Unread notification count fetched successfully',
      unreadCount: 4,
    });
  });
});
