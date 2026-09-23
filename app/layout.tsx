import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finance Checkpoint",
  description: "Private finance checkpoint and cash-flow tracker.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-GB">
      <body className="antialiased">{children}</body>
    </html>
  );
}
