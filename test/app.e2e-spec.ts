import request from 'supertest';

import { createTestApp, type TestAppContext } from './support/test-app';

describe('App (e2e)', () => {
  let context: TestAppContext;

  beforeAll(async () => {
    context = await createTestApp();
  });

  afterAll(async () => {
    await context.app.close();
  });

  it('GET / returns the standard response envelope', async () => {
    const response = await request(context.app.getHttpServer()).get('/').expect(200);

    expect(response.body).toEqual({
      statusCode: 200,
      message: 'Request successful',
      data: 'Welcome to Tenant Swap Management System',
    });
  });
});
