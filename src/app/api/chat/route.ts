import { NextResponse } from "next/server";

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { message } = await request.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Invalid message" }, { status: 400 });
    }

    // Echo response for now - in production this would route to CLAWDBOT
    const response = {
      message: `Echo: ${message}`,
      timestamp: new Date().toISOString(),
      status: "ok"
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
