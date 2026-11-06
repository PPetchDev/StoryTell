import { AppError } from './app-error.js';

import type { CreditPool } from '../service/model-gateway/model-gateway.js';

/** A failure the Model Gateway maps a provider response to. Callers show it with Retry. */
export abstract class ModelGatewayError extends AppError {}

export class ProviderOutageError extends ModelGatewayError {
    constructor(message = 'The model provider failed or is unavailable.') {
        super('502.001.001', message);
    }
}

/**
 * An outage that is only the host being busy: a 429 rate limit or a 503 overload that outlasted
 * the retries. Nothing ran, so another model on the same host may still answer.
 */
export class ProviderBusyError extends ProviderOutageError {}

/** The model refused, or the host stopped the output for content reasons. */
export class ModelRefusalError extends ModelGatewayError {
    constructor(message = 'The model refused to write this.') {
        super('422.001.002', message);
    }
}

export class OutOfCreditError extends ModelGatewayError {
    constructor(
        readonly pool: CreditPool,
        message = `Out of ${pool} credit.`,
    ) {
        super(pool === 'text' ? '402.001.003' : '402.001.004', message);
    }
}

export class UnparseableOutputError extends ModelGatewayError {
    constructor(message = 'The model returned output that could not be read.') {
        super('502.001.005', message);
    }
}
