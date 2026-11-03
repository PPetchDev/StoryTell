import { ProviderOutageError } from '../../errors/model-gateway.errors.js';
import {
    ImageGenerationResult,
    ModelGateway,
    RemainingCredit,
    TextCompletionResult,
} from './model-gateway.js';

// Placeholder until ticket 20 builds the OpenRouter and Runware gateway. Nothing calls the
// gateway yet; this keeps the app bootable with MODEL_GATEWAY=real in the meantime.
export class UnavailableModelGateway extends ModelGateway {
    async completeText(): Promise<TextCompletionResult> {
        throw new ProviderOutageError('The real Model Gateway is not built yet.');
    }

    async generateImage(): Promise<ImageGenerationResult> {
        throw new ProviderOutageError('The real Model Gateway is not built yet.');
    }

    async remainingCredit(): Promise<RemainingCredit> {
        throw new ProviderOutageError('The real Model Gateway is not built yet.');
    }
}
