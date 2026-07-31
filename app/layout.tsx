import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "生日優惠整理 | Birthday Rewards",
    template: "%s | 生日優惠整理",
  },
  description: "快速查詢、篩選各大店家生日優惠，收藏你的必換清單，再也不錯過兌換期限。",
  applicationName: "生日優惠整理",
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    locale: "zh_TW",
    siteName: "生日優惠整理",
    title: "生日優惠整理 | Birthday Rewards",
    description: "快速查詢、篩選各大店家生日優惠，收藏你的必換清單，再也不錯過兌換期限。",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#FAF8F4",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body className="font-sans">
        {children}
        <Toaster position="top-center" richColors closeButton />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
