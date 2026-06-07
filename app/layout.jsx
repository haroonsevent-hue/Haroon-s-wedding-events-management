export const metadata = {
  title: "Haroon's Weddings & Events",
  description: 'Premium wedding and event management services. Est. 1989 · Kerala.',
  keywords: ['wedding', 'events', 'Kerala', 'Haroon', 'event management'],
  openGraph: {
    title: "Haroon's Weddings & Events",
    description: 'Turning your special moments into lifelong memories.',
    type: 'website',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,700;1,400&family=Lato:wght@300;400;700&display=swap"
          rel="stylesheet"
        />
        <style>{`
          @keyframes iv-cw  { to { transform: rotate(360deg);  } }
          @keyframes iv-ccw { to { transform: rotate(-360deg); } }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          html, body { height: 100%; background: #070f0a; }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
