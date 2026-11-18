import { AppError } from './app-error.js';

/** Alerts are off on this server: no VAPID keys (.scratch/push-alerts/spec.md). */
export class AlertsOffError extends AppError {
    constructor() {
        super('404.011.001', 'Alerts are not set up on this server.');
    }
}

/** A subscription whose endpoint is not https on a known push service; the API never posts to any other address. */
export class UnknownPushServiceError extends AppError {
    constructor() {
        super('422.011.002', "This browser's push service isn't one Storytell can send to.");
    }
}
