import path from 'node:path';

import { ConfigError, loadConfig } from '../src/config/app-config.js';

const base = { PORT: '4001', DATABASE_URL: 'postgres://localhost/test', IMAGE_DIR: path.resolve('/data/storytell/images') };

// .scratch/read-aloud/spec.md, "Audio cache": the speech folder sits apart from the image
// folder, so the backup job, which copies the image folder, never copies audio.
describe('Config: the speech folder', () => {
    it('defaults to a folder named speech beside the image folder', () => {
        expect(loadConfig(base).speechDir).toBe(path.resolve('/data/storytell/speech'));
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
