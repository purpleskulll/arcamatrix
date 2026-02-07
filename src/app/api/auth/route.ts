import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
    }

    // Basic auth stub - in production would validate against customer database
    // For now, generate a demo token
    const token = Buffer.from(`${email}:${Date.now()}`).toString("base64");

    return NextResponse.json({
      success: true,
      token,
      dashboardUrl: `/dashboard?token=${token}`
    });
  } catch (error) {
    console.error("Auth error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
