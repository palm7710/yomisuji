import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  // シェア画像のURLを絶対URLにするための公開先。本番では SITE_URL を設定する
  metadataBase: new URL(process.env.SITE_URL ?? 'http://localhost:3000'),
  title: '読み筋診断（仮）',
  description: '小説もマンガも実用書も。好きな本から、本当に惹かれているものを言葉にする読書タイプ診断',
  openGraph: {
    title: '読み筋診断（仮）',
    description: '小説もマンガも実用書も。好きな本から、本当に惹かれているものを言葉にする読書タイプ診断',
    images: [{ url: '/yomisuji-intro.png', width: 1734, height: 907, alt: '読み筋診断の紹介' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '読み筋診断（仮）',
    description: '小説もマンガも実用書も。好きな本から、本当に惹かれているものを言葉にする読書タイプ診断',
    images: ['/yomisuji-intro.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f6f2ea',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@500;700;800&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
