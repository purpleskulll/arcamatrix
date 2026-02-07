import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arcamatrix - Your Personal AI Assistant",
  description: "Build your own AI assistant with the skills you need. Powered by advanced AI, customized for you.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="gradient-bg min-h-screen">{children}</body>
    </html>
  );
}
