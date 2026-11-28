import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * bge-m3 run by the app itself, as the backup for embeddings (.scratch/own-embeddings/spec.md). The
 * fp32 ONNX export (Xenova/bge-m3), CLS state normalised, gave the same vectors as DeepInfra's on the
 * live VM (cosine 1.00000 over 30 stored Memories), so stored vectors and these are compared as one
 * model. It is slow on the VM's 2 cores (10.5 s for a turn's ~970-token search), so it answers only
 * when no host that embeds can.
 */

/** What usage records name it: no provider at all. */
export const OWN_EMBEDDING_HOST = 'local';

/** The longest input bge-m3 reads, as DeepInfra's context is. */
export const OWN_EMBEDDING_MAX_TOKENS = 8192;

/** The files the model folder must hold. */
const MODEL_FILES = ['model.onnx', 'model.onnx_data', 'tokenizer.json', 'tokenizer_config.json'];

/** The tokenizer and the model, loaded. `run` answers the CLS token's last hidden state. */
export interface LoadedEmbeddingModel {
    tokenizer: { encode(text: string): { ids: number[] } };
    run(ids: number[]): Promise<Float32Array>;
}

/** Loads the tokenizer and the ONNX model from the folder, on first use. */
function onnxEmbeddingModel(modelDir: string): () => Promise<LoadedEmbeddingModel> {
    return async () => {
        const [{ Tokenizer }, ort] = await Promise.all([import('@huggingface/tokenizers'), import('onnxruntime-node')]);
        const read = (file: string) => JSON.parse(readFileSync(path.join(modelDir, file), 'utf8'));
        const tokenizer = new Tokenizer(read('tokenizer.json'), read('tokenizer_config.json'));
        const session = await ort.InferenceSession.create(path.join(modelDir, 'model.onnx'));
        const output = session.outputNames.includes('last_hidden_state') ? 'last_hidden_state' : session.outputNames[0];
        return {
            tokenizer,
            run: async (ids) => {
                const shape = [1, ids.length];
                const feeds: Record<string, InstanceType<typeof ort.Tensor>> = {
                    input_ids: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), shape),
                    attention_mask: new ort.Tensor('int64', new BigInt64Array(ids.length).fill(1n), shape),
                };
                const result = await session.run(feeds, [output]);
                const state = result[output].data as Float32Array;
                // [1, tokens, width]: the CLS token is the first row.
                const width = result[output].dims.at(-1) ?? state.length;
                return state.slice(0, width);
            },
        };
    };
}

export class OwnEmbedder {
    /** One input at a time: the model takes both cores. */
    private last: Promise<unknown> = Promise.resolve();
    private model: Promise<LoadedEmbeddingModel> | undefined;

    constructor(
        private readonly modelDir: string,
        private readonly load: () => Promise<LoadedEmbeddingModel> = onnxEmbeddingModel(modelDir),
        private readonly exists: (file: string) => boolean = existsSync,
    ) {}

    /** Whether the model's files are all there. Without them there is no backup. */
    available(): boolean {
        return MODEL_FILES.every((file) => this.exists(path.join(this.modelDir, file)));
    }

    /** One unit vector per input, in input order, and how many tokens were read. */
    embed(inputs: string[]): Promise<{ vectors: number[][]; promptTokens: number }> {
        const turn = this.last.then(() => this.embedAll(inputs));
        this.last = turn.catch(() => undefined);
        return turn;
    }

    private async embedAll(inputs: string[]): Promise<{ vectors: number[][]; promptTokens: number }> {
        this.model ??= this.load();
        this.model.catch(() => (this.model = undefined));
        const model = await this.model;
        const vectors: number[][] = [];
        let promptTokens = 0;
        for (const input of inputs) {
            let ids = model.tokenizer.encode(input).ids;
            if (ids.length > OWN_EMBEDDING_MAX_TOKENS) ids = [...ids.slice(0, OWN_EMBEDDING_MAX_TOKENS - 1), ids[ids.length - 1]];
            promptTokens += ids.length;
            const state = await model.run(ids);
            const length = Math.hypot(...state) || 1;
            vectors.push(Array.from(state, (value) => value / length));
        }
        return { vectors, promptTokens };
    }
}
