import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { loadConfig, loadEnvFile } from './config/app-config.js';

loadEnvFile();
const config = loadConfig();
const app = configureApp(await NestFactory.create(AppModule.forRoot(config)));
app.enableShutdownHooks();

SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle('Storytell AI API').setVersion('0.0.1').build(),
    ),
);

// Loopback by default: the frontend proxies to this port, and Tailscale serve fronts the frontend.
// Any other HOST needs LOGIN_PASSWORD (loadConfig refuses it otherwise).
await app.listen(config.port, config.host);
console.log(
    `Storytell API on http://${config.host}:${config.port} (gateway: ${config.modelGateway}, sign-in: ${config.loginPassword ? 'on' : 'off'})`,
);
