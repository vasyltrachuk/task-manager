import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Task&Control Accounting",
  description: "Адаптивний веб-додаток для постановки, виконання та контролю бухгалтерських завдань",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
