import { Test, TestingModule } from '@nestjs/testing';

import { ReliabilityService } from '../../common/services/reliability.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  const usersServiceMock = {
    getMe: jest.fn(),
    updateProfile: jest.fn(),
    changePassword: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: usersServiceMock,
        },
        {
          provide: ReliabilityService,
          useValue: {
            getStatus: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    usersServiceMock.getMe.mockReset();
    usersServiceMock.updateProfile.mockReset();
    usersServiceMock.changePassword.mockReset();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });


  it('should call getMe', async () => {
    const payload = { id: 'u1' } as any;

    usersServiceMock.getMe.mockResolvedValue({ message: 'ok' });

    await controller.getMe(payload);

    expect(usersServiceMock.getMe).toHaveBeenCalledWith('u1');
  });

  it('should call updateProfile', async () => {
    const payload = { id: 'u1' } as any;
    const dto: UpdateProfileDto = { fullName: 'New Name' };

    usersServiceMock.updateProfile.mockResolvedValue({ message: 'ok' });

    await controller.updateMe(payload, dto);

    expect(usersServiceMock.updateProfile).toHaveBeenCalledWith('u1', dto);
  });

  it('should call changePassword', async () => {
    const payload = { id: 'u1' } as any;
    const dto: ChangePasswordDto = {
      currentPassword: 'OldPassword1!',
      newPassword: 'NewPassword1!',
    };

    usersServiceMock.changePassword.mockResolvedValue({ message: 'ok' });

    await controller.updatePassword(payload, dto);

    expect(usersServiceMock.changePassword).toHaveBeenCalledWith('u1', dto);
  });
});
