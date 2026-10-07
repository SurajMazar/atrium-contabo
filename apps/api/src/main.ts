import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { env } from './config/env';
import { AppModule } from './app.module';
import { adminHostOrigins } from './common/admin-hosts';

async function bootstrap() {
  const config = env();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('v1');
  // Client IPs feed rate limits and audit logs: only trust X-Forwarded-For from known proxies.
  // TRUST_PROXY: false (default) | true | hop count | address/subnet list — see config/env.ts.
  app.set('trust proxy', config.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
  // JSON API: nothing it returns should ever render as a document (Swagger UI in dev is the exception).
  app.use((req: { path: string }, res: { setHeader(k: string, v: string): void }, next: () => void) => {
    if (!req.path.startsWith('/docs')) res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    next();
  });
  app.use(cookieParser());
  // Small bodies for unauthenticated endpoints; large ones only where site imports need them.
  app.use(['/v1/auth', '/v1/invitations'], json({ limit: '64kb' }));
  app.use('/v1/public', json({ limit: '512kb' }));
  app.useBodyParser('json', { limit: '25mb' });

  const allow = new Set(config.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean));
  app.enableCors((req: { url?: string; headers: Record<string, string | undefined> }, cb: (err: Error | null, opts: object) => void) => {
    const origin = req.headers.origin;
    // Public endpoints are called from customer domains: any origin, no credentials.
    if (req.url?.startsWith('/v1/public/')) return cb(null, { origin: true, credentials: false, methods: ['GET', 'POST', 'OPTIONS'], maxAge: 86_400 });
    cb(null, { origin: !origin || allow.has(origin) || adminHostOrigins().has(origin), credentials: true, exposedHeaders: ['Content-Disposition', 'ETag'], maxAge: 600 });
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
