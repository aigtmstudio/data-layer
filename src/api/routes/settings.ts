import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ServiceContainer } from '../../index.js';

interface SettingsOpts {
  container: ServiceContainer;
}

export const settingsRoutes: FastifyPluginAsync<SettingsOpts> = async (app, { container }) => {
  const { promptConfigService } = container;

  // GET /api/settings/prompts — list all prompts with current content
  app.get('/prompts', async () => {
    const prompts = await promptConfigService.listAll();
    return { data: prompts };
  });

  // PATCH /api/settings/prompts/:key — update a single prompt
  app.patch<{
    Params: { key: string };
    Body: { content: string };
  }>('/prompts/:key', async (request, reply) => {
    const { key } = request.params;
    const body = z.object({ content: z.string().min(1) }).parse(request.body);

    const updated = await promptConfigService.updatePrompt(key, body.content);
    return { data: updated };
  });

  // DELETE /api/settings/prompts/:key — reset a prompt to default
  app.delete<{
    Params: { key: string };
  }>('/prompts/:key', async (request) => {
    const { key } = request.params;
    const reset = await promptConfigService.resetPrompt(key);
    return { data: reset };
  });
};
