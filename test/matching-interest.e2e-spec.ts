import request from 'supertest';

import { authHeader, createTestUser, issueAccessToken } from './support/auth';
import { resetDatabase } from './support/reset-db';
import { createTestApp, type TestAppContext } from './support/test-app';

const ownerListingPayload = {
  desiredType: '3BR Flat',
  desiredState: 'Lagos',
  desiredCity: 'Ikeja',
  desiredArea: 'Alausa',
  maxBudget: 1300000,
  timeline: 'Within 2 Months',
  currentType: '2BR Flat',
  currentState: 'Ondo',
  currentCity: 'Akure',
  currentArea: 'Alagbaka',
  currentRent: 900000,
  currentAvailable: true,
  currentAvailableOn: '2026-04-01T00:00:00.000Z',
  features: ['Water', 'Tiles', 'Wardrobe'],
};

const requesterListingPayload = {
  desiredType: '2BR Flat',
  desiredState: 'Ondo',
  desiredCity: 'Akure',
  desiredArea: 'Alagbaka',
  maxBudget: 950000,
  timeline: 'Within 1 Month',
  currentType: '1BR Flat',
  currentState: 'Ekiti',
  currentCity: 'Ado Ekiti',
  currentArea: 'Fajuyi',
  currentRent: 500000,
  currentAvailable: true,
  currentAvailableOn: '2026-03-26T00:00:00.000Z',
  features: ['Water', 'Security'],
};

describe('Matching interest flow (e2e)', () => {
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

  it('lets a requester send interest, owner approve, and requester see unlocked contact', async () => {
    const owner = await createTestUser(context.prisma, {
      fullName: 'Owner User',
      phone: '+2348011111111',
    });
    const requester = await createTestUser(context.prisma, {
      fullName: 'Requester User',
      phone: '+2348022222222',
    });

    const ownerToken = issueAccessToken(context.jwtService, owner);
    const requesterToken = issueAccessToken(context.jwtService, requester);

    const ownerListingResponse = await request(context.app.getHttpServer())
      .post('/listings')
      .set(authHeader(ownerToken))
      .send(ownerListingPayload)
      .expect(201);

    const requesterListingResponse = await request(context.app.getHttpServer())
      .post('/listings')
      .set(authHeader(requesterToken))
      .send(requesterListingPayload)
      .expect(201);

    const targetListingId = ownerListingResponse.body.data.listing.id as string;
    const requesterListingId = requesterListingResponse.body.data.listing.id as string;

    const requestInterestResponse = await request(context.app.getHttpServer())
      .post(`/matching/interests/${targetListingId}/request`)
      .set(authHeader(requesterToken))
      .send({ requesterListingId })
      .expect(201);

    expect(requestInterestResponse.body.data.interest.status).toBe('REQUESTED');

    const incomingResponse = await request(context.app.getHttpServer())
      .get('/matching/interests/incoming')
      .set(authHeader(ownerToken))
      .expect(200);

    expect(incomingResponse.body.data.totalRequests).toBe(1);
    expect(incomingResponse.body.data.listings[0]).toMatchObject({
      listingId: targetListingId,
      openRequests: 1,
    });

    const interestId = incomingResponse.body.data.listings[0].requests[0].interestId as string;

    const approveResponse = await request(context.app.getHttpServer())
      .post(`/matching/interests/${interestId}/approve`)
      .set(authHeader(ownerToken))
      .expect(201);

    expect(approveResponse.body.data).toMatchObject({
      status: 'CONTACT_APPROVED',
      ownerContact: {
        fullName: 'Owner User',
        phone: '+2348011111111',
      },
    });

    const outgoingResponse = await request(context.app.getHttpServer())
      .get('/matching/interests/outgoing')
      .set(authHeader(requesterToken))
      .expect(200);

    expect(outgoingResponse.body.data.requests[0]).toMatchObject({
      status: 'CONTACT_APPROVED',
      listing: {
        id: targetListingId,
        currentState: 'Ondo',
        currentCity: 'Akure',
        currentArea: 'Alagbaka',
      },
      owner: {
        id: owner.id,
        fullName: 'Owner User',
        phone: '+2348011111111',
      },
      requesterListingId,
    });
  });
});
