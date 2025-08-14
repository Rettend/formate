// @refresh reload
import { createHandler, StartServer } from '@solidjs/start/server'

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" media="(prefers-color-scheme: light)" />
          <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" media="(prefers-color-scheme: light)" />
          <link rel="icon" type="image/png" sizes="32x32" href="/favicon-dark-32x32.png" media="(prefers-color-scheme: dark)" />
          <link rel="icon" type="image/png" sizes="16x16" href="/favicon-dark-16x16.png" media="(prefers-color-scheme: dark)" />
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
