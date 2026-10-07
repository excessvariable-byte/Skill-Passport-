import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skill Passport | Skills, understood",
  description: "Build a living skill passport, understand your progress, and share evidence with teams you choose.",
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
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
