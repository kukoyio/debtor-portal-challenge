import { ChatMessage } from "./types";

const store = new Map<string, ChatMessage[]>();

export function getRecentMessages(conversationId: string): ChatMessage[]{
    return store.get(conversationId) || [];
}

export function appendMessage(conversationId: string, message: ChatMessage): void{
    const messages = getRecentMessages(conversationId);
    messages.push(message);
    store.set(conversationId, messages);
}

export function clearConversation(conversationId: string): void{
    store.delete(conversationId);
}

