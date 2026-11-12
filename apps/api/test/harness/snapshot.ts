import type TestAgent from 'supertest/lib/agent.js';
import type { Response } from 'supertest';

/**
 * Takes a Snapshot the way the Snapshot sheet does (.scratch/snapshot-prompt-review/spec.md):
 * writes the Snapshot prompt, then draws it unedited. Answers the draw's response, the job.
 */
export async function takeSnapshot(
    http: TestAgent,
    storyId: number,
    chatId: number,
    body: { hint?: string; messageId?: number } = {},
): Promise<Response> {
    const written = await http.post(`/api/stories/${storyId}/chats/${chatId}/snapshot-prompts`).send(body).expect(201);
    return http
        .post(`/api/stories/${storyId}/chats/${chatId}/snapshots`)
        .send({ promptId: written.body.id, text: written.body.text })
        .expect(202);
}
