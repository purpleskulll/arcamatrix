import { NextResponse } from "next/server";
import { getCustomerByEmail } from "@/lib/provision";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    // Decode token to get email (token format: base64(email:timestamp))
    try {
      const decoded = Buffer.from(token, "base64").toString("utf-8");
      const email = decoded.split(":")[0];

      if (!email) {
        return NextResponse.json({ error: "Invalid token" }, { status: 400 });
      }

      // Try to fetch customer from external database
      const customer = await getCustomerByEmail(email);

      if (customer) {
        return NextResponse.json({
          email: customer.email,
          name: customer.name,
          skills: customer.skills,
          spriteUrl: customer.spriteUrl,
          status: customer.status,
          username: customer.username,
          token: token
        });
      }

      // If no customer found, return demo data (for testing)
      console.warn("Customer not found in database, returning demo data");
      return NextResponse.json({
        email: email,
        skills: ["whatsapp", "email", "calendar", "github"],
        spriteUrl: "https://demo.sprites.dev",
        status: "provisioning",
        token: token
      });
    } catch (decodeError) {
      console.error("Token decode error:", decodeError);
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }
  } catch (error) {
    console.error("Customer lookup error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
