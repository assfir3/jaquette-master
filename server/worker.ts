// Point d'entrée pour un futur déploiement sur Cloudflare Workers (assets statiques + /api).
import { handleApi, type Env } from './api';

interface WorkerEnv extends Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
}

export default {
  async fetch(req: Request, env: WorkerEnv): Promise<Response> {
    return (await handleApi(req, env)) ?? env.ASSETS.fetch(req);
  },
};
