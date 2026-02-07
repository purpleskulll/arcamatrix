import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    // Read customer data from JSON file
    const dataPath = path.join(process.cwd(), "data", "customers.json");

    try {
      const fileData = await fs.readFile(dataPath, "utf-8");
      const customers = JSON.parse(fileData);

      // Find customer by token
      const customer = customers.find((c: any) => c.token === token);

      if (!customer) {
        return NextResponse.json({ error: "Customer not found" }, { status: 404 });
      }

      return NextResponse.json(customer);
    } catch (fileError) {
      // If file doesn't exist or is empty, return demo data
      console.warn("Customer data file not found, using demo data");
      return NextResponse.json({
        email: "demo@example.com",
        skills: ["whatsapp", "email", "calendar", "github"],
        spriteUrl: "https://demo.sprites.dev",
        status: "online",
        aiProvider: "anthropic",
        token: token
      });
    }
  } catch (error) {
    console.error("Customer lookup error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
