/**
 * Reads e-mails the API sent to Mailpit (docker compose `mail` service).
 * API reference: https://mailpit.axllent.org/docs/api-v1/
 */
import { expect, type APIRequestContext } from '@playwright/test';
import { MAILPIT_URL } from './env';

interface MessageSummary {
    ID: string;
    Subject: string;
    To: { Address: string }[];
}

export interface Message extends MessageSummary {
    Text: string;
    HTML: string;
}

/** Waits for the newest message sent to `to` and returns it in full. */
export const waitForEmail = async (request: APIRequestContext, to: string): Promise<Message> => {
    let found: MessageSummary | undefined;
    await expect
        .poll(
            async () => {
                const res = await request.get(`${MAILPIT_URL}/api/v1/messages`, { params: { limit: 50 } });
                expect(res.ok(), `Mailpit is not reachable at ${MAILPIT_URL}; run npm run db:up`).toBe(true);
                const { messages } = (await res.json()) as { messages: MessageSummary[] };
                found = messages.find((m) => m.To.some((r) => r.Address.toLowerCase() === to.toLowerCase()));
                return found?.ID;
            },
            { message: `e-mail to ${to}`, timeout: 15_000 },
        )
        .toBeTruthy();

    const res = await request.get(`${MAILPIT_URL}/api/v1/message/${found!.ID}`);
    expect(res.ok()).toBe(true);
    return (await res.json()) as Message;
};

/** First link in the message whose URL contains `fragment`. */
export const linkIn = (message: Message, fragment: string) => {
    const links = [...message.HTML.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
    const link = links.find((href) => href.includes(fragment));
    if (!link) throw new Error(`No link containing "${fragment}" in "${message.Subject}"`);
    return link;
};
