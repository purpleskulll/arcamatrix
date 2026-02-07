import { NextResponse } from "next/server";

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
    }

    // Basic auth stub - in production would validate against customer database
    // For now, generate a demo token using btoa instead of Buffer
    const token = btoa(`${email}:${Date.now()}`);

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
