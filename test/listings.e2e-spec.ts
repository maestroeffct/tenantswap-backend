import request from 'supertest';

import { authHeader, createTestUser, issueAccessToken } from './support/auth';
import { resetDatabase } from './support/reset-db';
import { createTestApp, type TestAppContext } from './support/test-app';

const validListingPayload = {
  desiredType: '2BR Flat',
  desiredState: 'Lagos',
  desiredCity: 'Ikeja',
  desiredArea: 'Alausa',
  maxBudget: 800000,
  timeline: 'Within 1 Month',
  currentRent: 650000,
  currentType: '1BR Flat',
  currentState: 'Ondo',
  currentCity: 'Akure',
  currentArea: 'Alagbaka',
  currentAvailable: true,
  currentAvailableOn: '2026-03-25T00:00:00.000Z',
  features: ['Water', 'Tiles', 'Wardrobe'],
};

describe('Listings (e2e)', () => {
  let context: TestAppContext;

  beforeAll(async () => {
    context = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(context.prisma);
  });

  afterAll(async () => {
    await context.app.close();
  });

  it('creates a listing for an authenticated user', async () => {
    const user = await createTestUser(context.prisma);
    const accessToken = issueAccessToken(context.jwtService, user);

    const response = await request(context.app.getHttpServer())
      .post('/listings')
      .set(authHeader(accessToken))
      .send(validListingPayload)
      .expect(201);

    expect(response.body.message).toBe('Listing created successfully');
    expect(response.body.data.listing).toMatchObject({
      userId: user.id,
      desiredState: 'Lagos',
      desiredCity: 'Ikeja',
      desiredArea: 'Alausa',
      currentState: 'Ondo',
      currentCity: 'Akure',
      currentArea: 'Alagbaka',
      currentAvailable: true,
      matchCount: 0,
    });
    expect(response.body.data.listing.currentAvailableOn).toBeTruthy();

    const persistedUser = await context.prisma.user.findUnique({
      where: { id: user.id },
      select: { onboardingComplete: true },
    });

    expect(persistedUser?.onboardingComplete).toBe(true);
  });

  it('returns validation details for an invalid listing payload', async () => {
    const user = await createTestUser(context.prisma);
    const accessToken = issueAccessToken(context.jwtService, user);

    const invalidPayload = {
      ...validListingPayload,
      desiredState: undefined,
      currentAvailableOn: 'not-a-date',
      extraField: 'not-allowed',
    };

    const response = await request(context.app.getHttpServer())
      .post('/listings')
      .set(authHeader(accessToken))
      .send(invalidPayload)
      .expect(400);

    expect(response.body.message).toBe('Invalid request payload');
    expect(response.body.data.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('property extraField should not exist'),
        expect.stringContaining('desiredState must be a string'),
        expect.stringContaining('currentAvailableOn must be a valid ISO 8601 date string'),
      ]),
    );
  });
});
