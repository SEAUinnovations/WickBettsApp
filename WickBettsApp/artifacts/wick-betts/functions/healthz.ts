import { proxyToRailway } from './_shared/proxy';

type Env = {
  RAILWAY_API_ORIGIN?: string;
};

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  return proxyToRailway(request, env);
};
