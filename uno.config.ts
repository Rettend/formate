import {
  defineConfig,
  presetIcons,
  presetTypography,
  presetWind3,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'
import presetAnimations from 'unocss-preset-animations'
import { presetShadcn } from 'unocss-preset-shadcn'
import { minify } from './src/utils'

export default defineConfig({
  shortcuts: [
    {
      code: 'rounded-sm bg-muted-foreground/20 px-1 font-mono',
    },
  ],
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
  presets: [
    presetIcons({
      extraProperties: {
        'display': 'inline-block',
        'vertical-align': 'middle',
      },
    }),
    presetWind3(),
    presetTypography(),
    presetAnimations(),
    presetShadcn({
      color: {
        base: 'blue',
        name: 'tealFusion',
        light: {
          'card': '210 40% 98.6%',
          'primary': '190 90% 40%',
          'primary-foreground': '0 0% 98%',
          'destructive': '0 84.2% 60.2%',
          'ring': '190 92% 42%',
          'chart-1': '190 90% 40%',
          'chart-2': '200 85% 50%',
          'chart-3': '170 60% 42%',
          'chart-4': '205 80% 56%',
          'chart-5': '160 45% 46%',
        },
        dark: {
          'card': '217.2 32.6% 10.5%',
          'primary': '190 85% 48%',
          'primary-foreground': '210 40% 98%',
          'accent-foreground': '210 40% 98%',
          'destructive': '0 82.8% 60.6%',
          'ring': '190 88% 46%',
          'chart-1': '190 85% 48%',
          'chart-2': '200 80% 60%',
          'chart-3': '170 55% 50%',
          'chart-4': '205 75% 62%',
          'chart-5': '160 50% 48%',
        },
      },
    }),
  ],
  preflights: [
    {
      getCSS: () => {
        return minify`
          html {
            padding: 0;
            margin: 0;
            height: 100dvh;
            width: 100dvw;
            overflow-x: hidden;
            scroll-behavior: smooth;
          }

          body {
            font-family: 'League Spartan Variable', sans-serif;
          }

          /* Updated gradient to match tealFusion dual teal/blue identity */
          .bg-primary-gradient {
            background: linear-gradient(
              45deg,
              hsl(205 82% 40%) 0%,
              hsl(198 88% 44%) 45%,
              hsl(190 90% 46%) 100%
            );
            box-shadow: 0 2px 10px -2px hsl(var(--primary) / 0.35),
                        0 4px 20px -4px hsl(var(--primary) / 0.25);
            text-shadow: 0 2px 4px hsl(var(--primary-foreground) / 0.25);
            color: hsl(var(--primary-foreground));
            transition: opacity .15s ease-in-out, transform .15s ease-in-out;
          }

          .dark .bg-primary-gradient {
            background: linear-gradient(
              45deg,
              hsl(205 78% 46%) 0%,
              hsl(198 82% 50%) 40%,
              hsl(190 85% 55%) 100%
            );
            box-shadow: 0 2px 12px -2px hsl(var(--primary) / 0.4),
                        0 6px 28px -6px hsl(var(--primary) / 0.35);
          }

          .bg-primary-gradient:hover { opacity: 0.88; }
          .bg-primary-gradient:active { opacity: 0.82; transform: translateY(1px); }

          /* Destructive red gradient to mirror primary gradient behavior */
          .bg-destructive-gradient {
            background: linear-gradient(
              45deg,
              hsl(0 78% 52%) 0%,
              hsl(354 82% 56%) 45%,
              hsl(348 84% 58%) 100%
            );
            box-shadow: 0 2px 10px -2px hsl(var(--destructive) / 0.35),
                        0 4px 20px -4px hsl(var(--destructive) / 0.25);
            text-shadow: 0 2px 4px hsl(var(--destructive-foreground) / 0.25);
            color: hsl(var(--destructive-foreground));
            transition: opacity .15s ease-in-out, transform .15s ease-in-out;
          }

          .dark .bg-destructive-gradient {
            background: linear-gradient(
              45deg,
              hsl(0 82% 56%) 0%,
              hsl(354 86% 60%) 40%,
              hsl(348 88% 62%) 100%
            );
            box-shadow: 0 2px 12px -2px hsl(var(--destructive) / 0.4),
                        0 6px 28px -6px hsl(var(--destructive) / 0.35);
          }

          .bg-destructive-gradient:hover { opacity: 0.9; }
          .bg-destructive-gradient:active { opacity: 0.85; transform: translateY(1px); }

          ::-webkit-scrollbar {
            width: 12px;
          }

          ::-webkit-scrollbar-thumb {
            border-radius: 9999px;
            border: 4px solid transparent;
            background-clip: content-box;
            @apply bg-muted;
          }

          ::-webkit-scrollbar-corner { 
            display: none; 
          }
        `
      },
    },
  ],
  content: {
    pipeline: {
      include: [
        /\.(vue|svelte|[jt]sx|mdx?|astro|elm|php|phtml|html)($|\?)/,
        'src/**/*.{js,ts}',
      ],
    },
  },
})
