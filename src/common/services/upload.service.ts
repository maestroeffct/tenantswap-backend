import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class UploadService {
  constructor(private readonly config: ConfigService) {
    cloudinary.config({
      cloud_name: config.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: config.get<string>('CLOUDINARY_API_KEY'),
      api_secret: config.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  async uploadVerificationDocument(buffer: Buffer, listingId: string): Promise<string> {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('Empty file');
    }

    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: 'tenantswap/verification-docs',
            public_id: `listing_${listingId}`,
            overwrite: true,
            resource_type: 'auto',
          },
          (error, result) => {
            if (error || !result) {
              reject(new InternalServerErrorException('Document upload failed'));
            } else {
              resolve(result.secure_url);
            }
          },
        )
        .end(buffer);
    });
  }

  async uploadProfilePhoto(buffer: Buffer, userId: string): Promise<string> {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('Empty file');
    }

    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: 'tenantswap/profiles',
            public_id: `user_${userId}`,
            overwrite: true,
            transformation: [
              { width: 400, height: 400, crop: 'fill', gravity: 'face' },
              { quality: 'auto', fetch_format: 'auto' },
            ],
          },
          (error, result) => {
            if (error || !result) {
              reject(new InternalServerErrorException('Image upload failed'));
            } else {
              resolve(result.secure_url);
            }
          },
        )
        .end(buffer);
    });
  }

  async uploadPushNotificationImage(buffer: Buffer, notificationId: string): Promise<string> {
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('Empty file');
    }

    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            folder: 'tenantswap/push-notifications',
            public_id: `push_${notificationId}`,
            overwrite: true,
            transformation: [{ quality: 'auto', fetch_format: 'auto' }],
          },
          (error, result) => {
            if (error || !result) {
              reject(new InternalServerErrorException('Image upload failed'));
            } else {
              resolve(result.secure_url);
            }
          },
        )
        .end(buffer);
    });
  }

}
