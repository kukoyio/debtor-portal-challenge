import { NextResponse } from "next/server";

import type { ChatRequest, ChatResponse } from "@/lib/chat/types";
import { handleChatMessage } from "@/lib/chat/action-router";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ChatRequest>;
    const accountId = body.accountId?.trim();
    const message = body.message?.trim();

    if (!accountId || !message) {
      return NextResponse.json(
        { error: "accountId and message are required." },
        { status: 400 },
      );
    }

    const activeConversionId =
      body.conversationId?.trim() || crypto.randomUUID();

    const result = await handleChatMessage({
      accountId,
      message,
      conversationId: activeConversionId,
    });
    // Note: this generates a fresh id for the client-facing message; the
    // conversation store keeps its own separately-generated id for the same
    // content. Content is identical either way — only the id differs.
    const response: ChatResponse = {
      conversationId: activeConversionId,
      message: {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.reply,
        createdAt: new Date().toISOString(),
      },
      result,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("Critical error in /api/chat:", error);

    return NextResponse.json(
      { error: "An unexpected error occurred while processing your message." },
      { status: 500 },
    );
  }
}
