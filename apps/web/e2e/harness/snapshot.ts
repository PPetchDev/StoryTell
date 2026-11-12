import { APIRequestContext, APIResponse, expect } from '@playwright/test';

/**
 * Takes a Snapshot through the API the way the Snapshot sheet does (.scratch/snapshot-prompt-review/spec.md):
 * writes the Snapshot prompt, then draws it unedited. Answers the draw's response (202, the job).
 * The fake's `snapshot_prompt` and `snapshot_image` replies must be scripted first.
 */
export async function takeSnapshot(request: APIRequestContext, storyId: number, chatId: number, hint = ''): Promise<APIResponse> {
    const written = await request.post(`/api/stories/${storyId}/chats/${chatId}/snapshot-prompts`, { data: { hint } });
    expect(written.status()).toBe(201);
    const prompt = (await written.json()) as { id: string; text: string };
    return request.post(`/api/stories/${storyId}/chats/${chatId}/snapshots`, { data: { promptId: prompt.id, text: prompt.text } });
}
