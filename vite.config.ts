import { defineConfig, loadEnv, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { Readable } from 'node:stream';
import { handleApi } from './server/api';

/** Branche le serveur intermédiaire (/api/...) sur le serveur de développement. */
function apiPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'jaquette-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        const response = await handleApi(new Request(`http://localhost${req.url}`, { method: req.method }), env);
        if (!response) return next();
        res.statusCode = response.status;
        response.headers.forEach((v, k) => res.setHeader(k, v));
        if (response.body) Readable.fromWeb(response.body as never).pipe(res);
        else res.end();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Les clés restent côté serveur : pas de préfixe VITE_, donc jamais envoyées au navigateur.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [svelte(), apiPlugin(env)],
    server: { port: 5180 },
  };
});
