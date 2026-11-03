import { INestApplication, ValidationPipe } from '@nestjs/common';

import { AppErrorFilter } from './filter/app-error.filter.js';

/** Shared by main.ts and the test harness, so tests run the app exactly as it is served. */
export function configureApp(app: INestApplication): INestApplication {
    // The frontend proxies /api/* to this server, so the prefix keeps one URL space.
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AppErrorFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    return app;
}
