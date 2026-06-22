import path from 'path';
import { defineConfig, loadEnv, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Через ngrok/https-туннель браузер открывает внешний origin, по умолчанию HMR дергает
 * ws на localhost → WebSocket не проходит. Задаётся из .env:
 *   VITE_NGROK_HOST=xxxx.ngrok-free.app
 * или полный URL:
 *   VITE_DEV_PUBLIC_ORIGIN=https://xxxx.ngrok-free.app
 */
function tunnelHttps(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    return new URL(origin).protocol === 'https:';
  } catch {
    return true;
  }
}

/** Когда задаёт только hostname без схемы — считаем туннель HTTPS (типичный ngrok). */
function viteHmrForTunnel(env: Record<string, string>): NonNullable<UserConfig['server']>['hmr'] {
  const rawHost = env.VITE_NGROK_HOST?.trim();
  const origin = env.VITE_DEV_PUBLIC_ORIGIN?.trim();
  let hostname = rawHost ?? '';
  if (!hostname && origin) {
    try {
      hostname = new URL(origin).hostname;
    } catch {
      /* ignore */
    }
  }
  if (!hostname) return true;

  const forceWs = /^ws$/i.test(env.VITE_TUNNEL_WEBSOCKET_SCHEME ?? '');
  const httpsPreferred = forceWs ? false : tunnelHttps(origin ?? undefined);

  return {
    protocol: httpsPreferred ? 'wss' : 'ws',
    host: hostname,
    clientPort: httpsPreferred ? 443 : 80,
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const allowUnsafeEval = /^(1|true|yes)$/i.test(env.VITE_DEV_CSP_UNSAFE_EVAL ?? '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        /** Без этого HMR пытается подключиться к localhost/ws с туннеля (ngrok, cloudflare). */
        hmr: mode === 'development' ? viteHmrForTunnel(env) : true,
        // development: allow any Host (ngrok/cloudflared URLs change often)
        // production preview: keep explicit hosts
        allowedHosts:
          mode === 'development'
            ? true
            : ['sellbit-d66k.onrender.com', '9eab-80-79-6-88.ngrok-free.app'],
        headers:
          mode === 'development'
            ? {
                // Optional: only if some embedded scripts require eval/new Function in dev.
                // Enable via: VITE_DEV_CSP_UNSAFE_EVAL=1 in .env.local
                ...(allowUnsafeEval
                  ? {
                      'Content-Security-Policy':
                        "default-src 'self'; " +
                        "img-src 'self' data: https:; " +
                        "style-src 'self' 'unsafe-inline' https:; " +
                        "script-src 'self' 'unsafe-eval' 'unsafe-inline' https:; " +
                        "connect-src 'self' https: ws: wss:; " +
                        "frame-src 'self' https:; " +
                        "font-src 'self' data: https:;",
                    }
                  : {}),
              }
            : undefined,
      },
      plugins: [
        tailwindcss(),
        react(),
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (id.includes('node_modules')) {
                if (id.includes('react') || id.includes('react-dom')) return 'react';
                if (id.includes('lucide-react')) return 'icons';
                if (id.includes('html5-qrcode')) return 'qr';
                return 'vendor';
              }
            },
          },
        },
      },
    };
});
