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

// The frontend's proxy keeps its connections to this server open and reuses them. Node closes an
// idle one after 5 seconds by default; a request sent on it just as it closes is reset, the proxy
// answers 500 and the web shows "Can't connect" (seen in e2e, 2026-11-22). Kept open far longer
// than the proxy leaves one idle, the proxy is the one that closes, and nothing is reset.
const server = app.getHttpServer() as import('node:http').Server;
server.keepAliveTimeout = 120_000;
server.headersTimeout = 125_000;

// Loopback by default: the frontend proxies to this port, and Tailscale serve fronts the frontend.
// Any other HOST needs LOGIN_PASSWORD (loadConfig refuses it otherwise).
await app.listen(config.port, config.host);
console.log(
    `Storytell API on http://${config.host}:${config.port} (gateway: ${config.modelGateway}, sign-in: ${config.loginPassword ? 'on' : 'off'})`,
);
