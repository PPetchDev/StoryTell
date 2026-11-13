import {
    EmbeddingRequest,
    EmbeddingResult,
    ImageGenerationRequest,
    ImageGenerationResult,
    ModelGateway,
    RemainingCredit,
    SpeechRequest,
    SpeechResult,
    SpeechVoice,
    TextCompletionRequest,
    TextCompletionResult,
    TextStream,
    TextStreamResult,
    TranscriptionRequest,
    TranscriptionResult,
} from './model-gateway.js';
import { SpendCap } from './spend-cap.js';

/**
 * Every paid call runs through the Monthly cap (.scratch/accounts/spec.md: "Monthly cap"), so no
 * route can spend past it, whichever manager makes the call: see `SpendCap.run` for what passes.
 * Everything else is `inner`'s.
 */
export class CappedModelGateway extends ModelGateway {
    constructor(
        readonly inner: ModelGateway,
        private readonly cap: SpendCap,
    ) {
        super();
    }

    completeText(request: TextCompletionRequest): Promise<TextCompletionResult> {
        return this.cap.run(request.kind, () => this.inner.completeText(request));
    }

    streamText(request: TextCompletionRequest, stream: TextStream): Promise<TextStreamResult> {
        return this.cap.run(request.kind, () => this.inner.streamText(request, stream));
    }

    generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
        return this.cap.run(request.kind, () => this.inner.generateImage(request));
    }

    embedTexts(request: EmbeddingRequest): Promise<EmbeddingResult> {
        return this.cap.run(request.kind, () => this.inner.embedTexts(request));
    }

    embeddingModel(): string {
        return this.inner.embeddingModel();
    }

    transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
        return this.cap.run(request.kind, () => this.inner.transcribe(request));
    }

    synthesizeSpeech(request: SpeechRequest): Promise<SpeechResult> {
        return this.cap.run(request.kind, () => this.inner.synthesizeSpeech(request));
    }

    speechVoices(): Promise<SpeechVoice[]> {
        return this.inner.speechVoices();
    }

    remainingCredit(): Promise<RemainingCredit> {
        return this.inner.remainingCredit();
    }
}

/** The gateway behind the cap: the fake in tests and e2e, which they script and inspect. */
export function uncapped(gateway: ModelGateway): ModelGateway {
    return gateway instanceof CappedModelGateway ? gateway.inner : gateway;
}
