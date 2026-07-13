import { ForbiddenException, UnsupportedMediaTypeException } from '@nestjs/common';
import { SetupController } from './setup.controller';

const dto = {
  email: 'owner@example.com',
  password: 'StrongPassword123!',
  display_name: 'Owner',
};

function response() {
  return { cookie: jest.fn() };
}

describe('SetupController', () => {
  it('requires JSON so browser form posts cannot claim an instance', async () => {
    const controller = new SetupController({ complete: jest.fn() } as never);
    const req = { is: jest.fn(() => false), get: jest.fn() };

    await expect(controller.complete(dto, req as never, response() as never))
      .rejects.toBeInstanceOf(UnsupportedMediaTypeException);
  });

  it('rejects browser requests marked as cross-site', async () => {
    const controller = new SetupController({ complete: jest.fn() } as never);
    const req = {
      is: jest.fn(() => 'application/json'),
      get: jest.fn((name: string) => name === 'sec-fetch-site' ? 'cross-site' : undefined),
    };

    await expect(controller.complete(dto, req as never, response() as never))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});
