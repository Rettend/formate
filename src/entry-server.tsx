// @refresh reload
import { createHandler, StartServer } from '@solidjs/start/server'

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="theme-color" content="#0ea5e9" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="default" />
          <link rel="icon" type="image/svg+xml" href="/formate.svg" />

          {/* App-level defaults */}
          <title>Formate — LLM-powered conversational form builder</title>
          <meta name="description" content="Formate lets you design and run conversational, interview-style surveys powered by LLMs." />

          {/* OpenGraph defaults */}
          <meta property="og:site_name" content="Formate" />
          <meta property="og:type" content="website" />
          <meta property="og:title" content="Formate — LLM-powered conversational form builder" />
          <meta property="og:description" content="Design and run conversational, interview-style surveys powered by LLMs." />
          <meta property="og:image" content="https://formate.app/thumbnail.webp" />

          {/* Twitter defaults */}
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content="Formate — LLM-powered conversational form builder" />
          <meta name="twitter:description" content="Design and run conversational, interview-style surveys powered by LLMs." />
          <meta name="twitter:image" content="https://formate.app/thumbnail.webp" />

          {assets}
        </head>
        <body>
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
))
