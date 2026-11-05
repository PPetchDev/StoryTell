import { devicePreference } from './device-preference';

/**
 * Whether the Chat's Scene strip is hidden on this device (spec: story 45). Blocked or empty
 * storage shows it.
 */
const sceneStripHidden = devicePreference<boolean>({
    key: 'storytell.sceneStrip',
    fallback: false,
    parse: (stored) => stored === 'hidden',
    serialise: (hidden) => (hidden ? 'hidden' : null),
});

export const setSceneStripHidden = sceneStripHidden.set;

/** True when this device hides the Scene strip; shown while rendering on the server. */
export const useSceneStripHidden = sceneStripHidden.useValue;
