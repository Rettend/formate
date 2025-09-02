import type { APIEvent } from '@solidjs/start/server'

/*
  Open Graph image generator (SVG)
  - URL: /api/og/:id?t=Title
  - Returns a 1200x630 SVG with a teal/blue gradient and the title text
*/

function hashStringToNumber(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i++)
    hash = Math.imul(31, hash) + input.charCodeAt(i) | 0
  return Math.abs(hash)
}

function pickGradientColors(seed: string): { h1: number, h2: number } {
  const n = hashStringToNumber(seed)
  // Keep hues in the teal/blue band (roughly 190-205)
  const base = 190
  const span = 15
  const h1 = base + (n % span)
  const h2 = base + ((n >> 3) % span)
  return { h1, h2 }
}

function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

export function GET(event: APIEvent) {
  const id = event.params?.id || 'form'
  const url = new URL(event.request.url)
  const titleParam = url.searchParams.get('t') || 'Formate form'
  const title = titleParam.length > 120 ? `${titleParam.slice(0, 117)}…` : titleParam
  const { h1, h2 } = pickGradientColors(id)

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(title)}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${h1} 82% 46%)" />
      <stop offset="45%" stop-color="hsl(${(h1 + h2) / 2} 86% 50%)" />
      <stop offset="100%" stop-color="hsl(${h2} 88% 55%)" />
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="8" />
      <feOffset dx="0" dy="4" result="o" />
      <feComponentTransfer>
        <feFuncA type="linear" slope="0.35" />
      </feComponentTransfer>
      <feMerge>
        <feMergeNode in="o" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
  <rect width="1200" height="630" fill="url(#g)" />
  <g filter="url(#softShadow)">
    <rect x="48" y="48" rx="24" ry="24" width="1104" height="534" fill="rgba(255,255,255,0.08)" />
  </g>
  <g transform="translate(96, 150)">
    <text x="0" y="0" font-family="'Segoe UI', 'Inter', system-ui, -apple-system, sans-serif" font-size="72" font-weight="700" fill="white" letter-spacing="0.5">
      <tspan x="0" dy="0">${escapeXml(title)}</tspan>
    </text>
    <text x="0" y="96" font-family="'Segoe UI', 'Inter', system-ui, -apple-system, sans-serif" font-size="28" font-weight="500" fill="rgba(255,255,255,0.92)">
      Conversational, interview-style surveys powered by LLMs
    </text>
  </g>
  <g transform="translate(96, 510)">
    <rect x="0" y="-36" rx="10" ry="10" width="220" height="48" fill="rgba(255,255,255,0.12)" />
    <text x="16" y="0" font-family="'Segoe UI', 'Inter', system-ui, -apple-system, sans-serif" font-size="24" font-weight="600" fill="white">Formate</text>
  </g>
</svg>`

  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=86400',
    },
  })
}
