import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { env } from './config/env';
import { AppModule } from './app.module';

async function bootstrap() {
  const config = env();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('v1');
  if (config.TRUST_PROXY) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '25mb' });

  const allow = new Set(config.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean));
  app.enableCors((req: { url?: string; headers: Record<string, string | undefined> }, cb: (err: Error | null, opts: object) => void) => {
    const origin = req.headers.origin;
    // Public endpoints are called from customer domains: any origin, no credentials.
    if (req.url?.startsWith('/v1/public/')) return cb(null, { origin: true, credentials: false, methods: ['GET', 'POST', 'OPTIONS'], maxAge: 86_400 });
    cb(null, { origin: !origin || allow.has(origin), credentials: true, exposedHeaders: ['Content-Disposition', 'ETag'], maxAge: 600 });
  });

  if (config.SWAGGER && config.NODE_ENV !== 'production') {
    const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Atrium API').setVersion('1').addBearerAuth().build());
    SwaggerModule.setup('docs', app, doc);
  }

  app.enableShutdownHooks();
  await app.listen(config.API_PORT, '0.0.0.0');
  app.get(Logger).log(`Atrium API listening on :${config.API_PORT}`);
}

process.on('unhandledRejection', (reason) => {
  // Never let a stray promise take the API down; surface it in logs instead.
  console.error(JSON.stringify({ level: 50, msg: 'unhandledRejection', err: reason instanceof Error ? { message: reason.message, stack: reason.stack } : String(reason) }));
});

void bootstrap();
