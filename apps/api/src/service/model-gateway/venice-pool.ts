import { ModelGateway } from './model-gateway.js';

/** True when the Venice pool's remaining credit is known and used up: new audio is refused before any call. */
export async function venicePoolUsedUp(gateway: ModelGateway): Promise<boolean> {
    const remaining = (await gateway.remainingCredit()).image.remainingUsd;
    return remaining !== null && remaining <= 0;
}
