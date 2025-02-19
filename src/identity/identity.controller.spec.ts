import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { IdentityModuleConfig } from './identity.module';
import { IdentityService } from './identity.service';
import { ConfigService } from '../config/config.service';
import { LoggerService } from '../logger/logger.service';

describe('DidController', () => {
  let module: TestingModule;
  let loggerService: LoggerService;
  let identityService: IdentityService;
  let configService: ConfigService;
  let app: INestApplication;

  function spy() {
    const identity = {
      resolve: jest.spyOn(identityService, 'resolve').mockImplementation(() => {
        return {
          id: 'mock-did'
        } as any;
      }),
    };

    const logger = {
      error: jest.spyOn(loggerService, 'error').mockImplementation(() => {}),
    };

    return { identity, logger };
  }

  beforeEach(async () => {
    module = await Test.createTestingModule(IdentityModuleConfig).compile();
    app = module.createNestApplication();
    await app.init();

    configService = module.get<ConfigService>(ConfigService);
    loggerService = module.get<LoggerService>(LoggerService);
    identityService = module.get<IdentityService>(IdentityService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('GET /identity/:url', () => {
    test('should get a identity document for the url', async () => {
      const spies = spy();

      const res = await request(app.getHttpServer())
        .get('/identities/did:lto:sender')
        .send();

      expect(res.status).toBe(200);
      expect(res.header['content-type']).toBe('application/json; charset=utf-8');
      expect(res.body).toEqual({
        id: 'mock-did'
      });

      expect(spies.logger.error.mock.calls.length).toBe(0);
      expect(spies.identity.resolve.mock.calls.length).toBe(1);
    });

    test('should return error if identity service fails', async () => {
      const spies = spy();

      spies.identity.resolve = jest.spyOn(identityService, 'resolve').mockImplementation(() => {
        throw Error('some bad error')
      });

      const res = await request(app.getHttpServer())
        .get('/identities/did:lto:sender')
        .send();

      expect(res.status).toBe(500);
      expect(res.header['content-type']).toBe('application/json; charset=utf-8');
      expect(res.body).toEqual({ error: `failed to get DID document '${Error('some bad error')}'` });

      expect(spies.logger.error.mock.calls.length).toBe(1);
      expect(spies.identity.resolve.mock.calls.length).toBe(1);
    });
  });
});
