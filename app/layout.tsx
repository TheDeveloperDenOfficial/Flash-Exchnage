import React from 'react';

export const metadata = {
  title: 'Flash Exchange | Buy Crypto Instantly',
  description: 'The fastest and most secure way to buy cryptocurrency tokens.',
  icons: { icon: '/images/favicon.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="js">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <link rel="stylesheet" href="/assets/css/vendor.bundle.css" />
        <link rel="stylesheet" href="/assets/css/style-azalea.css" />
        <link rel="stylesheet" href="/assets/css/theme.css" />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
        />
      </head>
      <body className="nk-body body-wider bg-theme mode-onepage">
        {children}
      </body>
    </html>
  );
}
