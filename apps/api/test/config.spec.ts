import path from 'node:path';

import { ConfigError, loadConfig } from '../src/config/app-config.js';

const base = { PORT: '4001', DATABASE_URL: 'postgres://localhost/test', IMAGE_DIR: path.resolve('/data/storytell/images') };

// .scratch/read-aloud/spec.md, "Audio cache": the speech folder sits apart from the image
// folder, so the backup job, which copies the image folder, never copies audio.
describe('Config: the speech folder', () => {
    it('defaults to a folder named speech beside the image folder', () => {
        expect(loadConfig(base).speechDir).toBe(path.resolve('/data/storytell/speech'));
        // .scratch/own-cutout/spec.md: the remover's model file sits beside the image folder too.
        expect(loadConfig(base).cutoutModelPath).toBe(path.resolve('/data/storytell/models/isnet-anime.onnx'));
        expect(loadConfig({ ...base, CUTOUT_MODEL: '/opt/models/m.onnx' }).cutoutModelPath).toBe(path.resolve('/opt/models/m.onnx'));
        // .scratch/soft-cutout/spec.md: so does the model that enlarges a picture before a soft cut-out.
        expect(loadConfig(base).enlargeModelPath).toBe(path.resolve('/data/storytell/models/AnimeSharpV2_MoSR_Soft_x2.onnx'));
        expect(loadConfig({ ...base, ENLARGE_MODEL: '/opt/models/e.onnx' }).enlargeModelPath).toBe(path.resolve('/opt/models/e.onnx'));
    });

    it('takes SPEECH_DIR when it is set, as an absolute path', () => {
        expect(loadConfig({ ...base, SPEECH_DIR: '/elsewhere/audio' }).speechDir).toBe(path.resolve('/elsewhere/audio'));
    });

    it.each([
        ['inside the image folder', '/data/storytell/images/speech'],
        ['the image folder itself', '/data/storytell/images'],
    ])('refuses a SPEECH_DIR %s', (_case, speechDir) => {
        expect(() => loadConfig({ ...base, SPEECH_DIR: speechDir })).toThrow(ConfigError);
        expect(() => loadConfig({ ...base, SPEECH_DIR: speechDir })).toThrow(/SPEECH_DIR/);
    });

    it('allows a sibling whose name only starts like the image folder', () => {
        expect(loadConfig({ ...base, SPEECH_DIR: '/data/storytell/images-speech' }).speechDir).toBe(
            path.resolve('/data/storytell/images-speech'),
        );
    });
});

// .scratch/text-fallback/spec.md: the text chain, and TEXT_HOST from before it.
describe('Config: the text hosts', () => {
    it('is OpenRouter alone by default', () => {
        expect(loadConfig(base).textHosts).toEqual(['openrouter']);
    });

    it('keeps TEXT_HOST=venice working as a chain of one', () => {
        expect(loadConfig({ ...base, TEXT_HOST: 'venice' }).textHosts).toEqual(['venice']);
    });

    // .scratch/nanogpt-provider/spec.md: NanoGPT first, with its own key.
    it('takes nanogpt in TEXT_HOSTS, and refuses it without NANOGPT_API_KEY', () => {
        const config = loadConfig({ ...base, TEXT_HOSTS: 'nanogpt,openrouter,free', NANOGPT_API_KEY: 'sk-nano-test' });
        expect(config.textHosts).toEqual(['nanogpt', 'openrouter', 'free']);
        expect(config.providerKeys.nanoGpt).toBe('sk-nano-test');
        expect(() => loadConfig({ ...base, TEXT_HOSTS: 'nanogpt,openrouter' })).toThrow(/NANOGPT_API_KEY/);
    });

    it('reads TEXT_HOSTS in order, ahead of TEXT_HOST', () => {
        expect(loadConfig({ ...base, TEXT_HOSTS: 'openrouter, venice,free', TEXT_HOST: 'venice' }).textHosts).toEqual(['openrouter', 'venice', 'free']);
    });

    it('refuses an unknown host, a repeated one, or an empty list', () => {
        expect(() => loadConfig({ ...base, TEXT_HOSTS: 'openrouter,groq' })).toThrow(/TEXT_HOSTS/);
        expect(() => loadConfig({ ...base, TEXT_HOSTS: 'venice,venice' })).toThrow(/twice/);
        expect(() => loadConfig({ ...base, TEXT_HOSTS: ' , ' })).toThrow(ConfigError);
    });
});
