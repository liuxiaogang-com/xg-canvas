import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser = require('cookie-parser');
import type { NextFunction, Request, Response } from 'express';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Honor X-Forwarded-For from a trusted proxy (LB / nginx / dev proxy) so req.ip
  // is the real client, not the proxy. Default trusts loopback; override with
  // TRUST_PROXY (true | false | a hop count | a subnet).
  const trust = process.env.TRUST_PROXY;
  app.set(
    'trust proxy',
    trust === undefined ? 'loopback' : trust === 'true' ? true : trust === 'false' ? false : trust,
  );

  // Stamp every request with an id (reuse an incoming one or mint a uuid) and echo it
  // back as a header, so errors can surface the id for support/log lookup. (F2/F3)
  app.use((req: Request, res: Response, next: NextFunction) => {
    const incoming = req.headers['x-request-id'];
    const id = (typeof incoming === 'string' && incoming) || randomUUID();
    (req as Request & { id?: string }).id = id;
    res.setHeader('x-request-id', id);
    next();
  });

  app.use(cookieParser());
  const configuredOrigins = process.env.CORS_ORIGIN
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (configuredOrigins?.includes('*')) {
    throw new Error('CORS_ORIGIN cannot contain * when credentialed requests are enabled');
  }
  const corsOrigins = configuredOrigins?.length
    ? configuredOrigins
    : process.env.NODE_ENV === 'production'
      ? []
      : ['http://localhost:5180', 'http://127.0.0.1:5180'];
  // The normal Web path is same-origin through Vite/nginx and needs no CORS.
  // Production only enables cross-origin credentials when explicitly allowlisted.
  if (corsOrigins.length) {
    app.enableCors({
      origin: corsOrigins,
      credentials: true,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      allowedHeaders: 'Content-Type,Authorization,Accept,Cookie',
    });
  }

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());

  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  const port = Number(process.env.PORT ?? 5181);
  await app.listen(port);
  logger.log(`canvas-api listening on http://localhost:${port}`);
}

bootstrap();
