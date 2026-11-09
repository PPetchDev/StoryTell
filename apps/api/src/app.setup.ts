import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppErrorFilter } from './filter/app-error.filter.js';

/** Shared by main.ts and the test harness, so tests run the app exactly as it is served. */
export function configureApp(app: INestApplication): INestApplication {
    // The frontend proxies /api/* to this server, so the prefix keeps one URL space.
    app.setGlobalPrefix('api');
    // A Document is up to 200,000 characters, Thai up to 3 bytes each (Express's default is
    // 100 kB). Room above that, so a text over the limit gets the Document's own size error.
    (app as NestExpressApplication).useBodyParser('json', { limit: '4mb' });
    app.useGlobalFilters(new AppErrorFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    return app;
}
