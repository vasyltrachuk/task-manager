import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Task&Control Accounting",
  description: "Адаптивний веб-додаток для постановки, виконання та контролю бухгалтерських завдань",
};

const sidebarScript = `(function(){try{if(localStorage.getItem('sidebar-collapsed')==='true')document.documentElement.classList.add('sidebar-collapsed')}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: sidebarScript }} />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
