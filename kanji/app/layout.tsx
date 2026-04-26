import type { Metadata } from "next";
import { Inter, Noto_Sans_JP } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "KANJI — 幹事ツール",
  description: "飲み会の調整からお店決め、会計までまとめて進められる幹事ツール",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${inter.variable} ${notoSansJP.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/*
          ValueCommerce LinkSwitch
          - NEXT_PUBLIC_VC_LINKSWITCH_ID が設定されているときだけ挿入する
          - 未設定のままでも通常の Hot Pepper リンクとして正常動作する
          - 挿入後は <a href="https://www.hotpepper.jp/..."> が自動的にアフィリエイトURLへ変換される
          - 動作確認: LinkSwitch タグ設置後、予約ボタンをホバーしてブラウザのステータスバーを確認
        */}
        {process.env.NEXT_PUBLIC_VC_LINKSWITCH_ID && (
          <Script
            src="//js.vc-mp.com/ls/linkswitch.js"
            data-vc-tag={process.env.NEXT_PUBLIC_VC_LINKSWITCH_ID}
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
