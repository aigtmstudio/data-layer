import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDb, schema } from '../../db/index.js';
import { eq, and } from 'drizzle-orm';
import type { ServiceContainer } from '../../index.js';
import type { IcpFilters, IcpSourceRecord } from '../../db/schema/icps.js';
import type { ProcessedSource } from '../../services/icp-engine/source-processor.js';

const createIcpBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  naturalLanguageInput: z.string().optional(),
  filters: z.record(z.unknown()).optional(),
});

const updateIcpBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  naturalLanguageInput: z.string().optional(),
  filters: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

const transcriptBody = z.object({
  text: z.string().min(1),
});

const parseSourcesBody = z.object({
  generatePersona: z.boolean().optional(),
});

const ALLOWED_DOC_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
]);

// In-memory store for pending sources before parsing
// Key: icpId, Value: array of processed sources
const pendingSources = new Map<string, ProcessedSource[]>();

export const icpRoutes: FastifyPluginAsync<{ container: ServiceContainer }> = async (app, opts) => {
  const { container } = opts;

  // ── Existing CRUD routes ──

  // GET /api/clients/:clientId/icps
  app.get<{ Params: { clientId: string } }>('/:clientId/icps', async (request) => {
    const db = getDb();
    const icps = await db
      .select()
      .from(schema.icps)
      .where(and(eq(schema.icps.clientId, request.params.clientId), eq(schema.icps.isActive, true)));
    return { data: icps };
  });

  // POST /api/clients/:clientId/icps
  app.post<{ Params: { clientId: string } }>('/:clientId/icps', async (request, reply) => {
    const body = createIcpBody.parse(request.body);
    const db = getDb();

    let filters: Record<string, unknown> = body.filters ?? {};
    let confidence: number | undefined;

    // If natural language input provided, parse it
    if (body.naturalLanguageInput && !body.filters) {
      const parsed = await container.icpParser.parseNaturalLanguage(body.naturalLanguageInput);
      filters = parsed.filters as unknown as Record<string, unknown>;
      confidence = parsed.confidence;
    }

    const [icp] = await db
      .insert(schema.icps)
      .values({
        clientId: request.params.clientId,
        name: body.name,
        description: body.description,
        naturalLanguageInput: body.naturalLanguageInput,
        filters,
        aiParsingConfidence: confidence != null ? String(confidence) : undefined,
        lastParsedAt: confidence != null ? new Date() : undefined,
      })
      .returning();

    return reply.status(201).send({ data: icp });
  });

  // PATCH /api/clients/:clientId/icps/:id
  app.patch<{ Params: { clientId: string; id: string } }>('/:clientId/icps/:id', async (request) => {
    const body = updateIcpBody.parse(request.body);
    const db = getDb();
    const [updated] = await db
      .update(schema.icps)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(schema.icps.id, request.params.id))
      .returning();
    return { data: updated };
  });

  // POST /api/clients/:clientId/icps/:id/parse — re-parse NL to structured
  app.post<{ Params: { clientId: string; id: string } }>('/:clientId/icps/:id/parse', async (request) => {
    const db = getDb();
    const [icp] = await db.select().from(schema.icps).where(eq(schema.icps.id, request.params.id));
    if (!icp || !icp.naturalLanguageInput) {
      return { error: 'ICP not found or has no natural language input' };
    }

    const parsed = await container.icpParser.parseNaturalLanguage(icp.naturalLanguageInput);

    const [updated] = await db
      .update(schema.icps)
      .set({
        filters: parsed.filters,
        aiParsingConfidence: String(parsed.confidence),
        lastParsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.icps.id, request.params.id))
      .returning();

    return { data: updated };
  });

  // ── Source upload routes ──

  // POST /api/clients/:clientId/icps/:id/sources/document — upload a document
  app.post<{ Params: { clientId: string; id: string } }>(
    '/:clientId/icps/:id/sources/document',
    async (request, reply) => {
      const file = await request.file();
      if (!file) return reply.status(400).send({ error: 'No file uploaded' });

      if (!ALLOWED_DOC_TYPES.has(file.mimetype)) {
        return reply.status(400).send({
          error: `Unsupported file type: ${file.mimetype}. Allowed: PDF, DOCX, PPTX, TXT`,
        });
      }

      const buffer = await file.toBuffer();
      const processed = await container.sourceProcessor.processDocument(
        buffer,
        file.mimetype,
        file.filename,
      );

      // Store in pending sources
      const existing = pendingSources.get(request.params.id) ?? [];
      existing.push(processed);
      pendingSources.set(request.params.id, existing);

      return reply.status(201).send({
        data: {
          sourceType: 'document',
          fileName: file.filename,
          textPreview: processed.rawText?.slice(0, 500),
          metadata: processed.metadata,
          pendingSources: existing.length,
        },
      });
    },
  );

  // POST /api/clients/:clientId/icps/:id/sources/transcript — paste a transcript
  app.post<{ Params: { clientId: string; id: string } }>(
    '/:clientId/icps/:id/sources/transcript',
    async (request, reply) => {
      const body = transcriptBody.parse(request.body);
      const processed = container.sourceProcessor.processTranscript(body.text);

      const existing = pendingSources.get(request.params.id) ?? [];
      existing.push(processed);
      pendingSources.set(request.params.id, existing);

      return reply.status(201).send({
        data: {
          sourceType: 'transcript',
          textPreview: processed.rawText?.slice(0, 500),
          metadata: processed.metadata,
          pendingSources: existing.length,
        },
      });
    },
  );

  // POST /api/clients/:clientId/icps/:id/sources/classic — add classic selectors
  app.post<{ Params: { clientId: string; id: string } }>(
    '/:clientId/icps/:id/sources/classic',
    async (request, reply) => {
      const filters = request.body as Partial<IcpFilters>;
      const processed = container.sourceProcessor.processClassicSelectors(filters);

      const existing = pendingSources.get(request.params.id) ?? [];
      existing.push(processed);
      pendingSources.set(request.params.id, existing);

      return reply.status(201).send({
        data: {
          sourceType: 'classic',
          metadata: processed.metadata,
          pendingSources: existing.length,
        },
      });
    },
  );

  // POST /api/clients/:clientId/icps/:id/sources/crm-csv — upload CRM CSV
  app.post<{ Params: { clientId: string; id: string } }>(
    '/:clientId/icps/:id/sources/crm-csv',
    async (request, reply) => {
      const file = await request.file();
      if (!file) return reply.status(400).send({ error: 'No file uploaded' });

      if (file.mimetype !== 'text/csv' && !file.filename.endsWith('.csv')) {
        return reply.status(400).send({ error: 'File must be a CSV' });
      }

      const buffer = await file.toBuffer();
      const processed = await container.sourceProcessor.processCrmCsv(buffer);

      const existing = pendingSources.get(request.params.id) ?? [];
      existing.push(processed);
      pendingSources.set(request.params.id, existing);

      return reply.status(201).send({
        data: {
          sourceType: 'crm_csv',
          insights: processed.crmInsights,
          metadata: processed.metadata,
          pendingSources: existing.length,
        },
      });
    },
  );

  // GET /api/clients/:clientId/icps/:id/sources — list pending sources
  app.get<{ Params: { clientId: string; id: string } }>(
    '/:clientId/icps/:id/sources',
    async (request) => {
      const sources = pendingSources.get(request.params.id) ?? [];
      return {
        data: sources.map(s => ({
          sourceType: s.sourceType,
          textPreview: s.rawText?.slice(0, 200),
          hasStructuredData: !!s.structuredData,
          hasCrmInsights: !!s.crmInsights,
          metadata: s.metadata,
        })),
      };
    },
  );

  // DELETE /api/clients/:clientId/icps/:id/sources — clear pending sources
  app.delete<{ Params: { clientId: string; id: string } }>(
    '/:clientId/icps/:id/sources',
    async (request) => {
      pendingSources.delete(request.params.id);
      return { data: { cleared: true } };
    },
  );

  // POST /api/clients/:clientId/icps/:id/parse-sources — parse all pending sources
  app.post<{ Params: { clientId: string; id: string } }>(
    '/:clientId/icps/:id/parse-sources',
    async (request, reply) => {
      const body = parseSourcesBody.parse(request.body ?? {});
      const db = getDb();

      const [icp] = await db.select().from(schema.icps).where(eq(schema.icps.id, request.params.id));
      if (!icp) return reply.status(404).send({ error: 'ICP not found' });

      const sources = pendingSources.get(request.params.id) ?? [];
      if (sources.length === 0) {
        return reply.status(400).send({ error: 'No sources added. Add at least one source first.' });
      }

      const result = await container.icpParser.parseFromSources({
        sources,
        clientId: request.params.clientId,
        existingFilters: icp.filters as Partial<IcpFilters>,
        generatePersona: body.generatePersona,
      });

      // Build source records for persistence
      const sourceRecords: IcpSourceRecord[] = sources.map(s => ({
        sourceType: s.sourceType,
        fileName: s.metadata.fileName as string | undefined,
        addedAt: new Date().toISOString(),
        contribution: result.sourceContributions[s.sourceType] ?? [],
      }));

      // Insert auto-generated persona if produced
      let suggestedPersonaId: string | undefined;
      if (result.suggestedPersona) {
        const [persona] = await db
          .insert(schema.personas)
          .values({
            icpId: request.params.id,
            name: result.suggestedPersona.name,
            description: result.suggestedPersona.reasoning,
            titlePatterns: result.suggestedPersona.titlePatterns,
            seniorityLevels: result.suggestedPersona.seniorityLevels,
            departments: result.suggestedPersona.departments,
            isAutoGenerated: true,
            generatedFromIcpId: request.params.id,
          })
          .returning();
        suggestedPersonaId = persona.id;
      }

      // Update ICP with parsed data
      const [updated] = await db
        .update(schema.icps)
        .set({
          filters: result.filters,
          sources: sourceRecords,
          providerHints: result.providerHints,
          suggestedPersonaId,
          aiParsingConfidence: String(result.confidence),
          lastParsedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.icps.id, request.params.id))
        .returning();

      // Clear pending sources
      pendingSources.delete(request.params.id);

      return {
        data: {
          icp: updated,
          providerHints: result.providerHints,
          suggestedPersona: result.suggestedPersona,
          sourceContributions: result.sourceContributions,
          confidence: result.confidence,
        },
      };
    },
  );

  // ── Single-shot build endpoint ──

  // POST /api/clients/:clientId/icps/build — create ICP from sources in one call
  app.post<{ Params: { clientId: string } }>('/:clientId/icps/build', async (request, reply) => {
    const parts = request.parts();
    const db = getDb();

    let name = '';
    let description: string | undefined;
    let generatePersona = false;
    let classicFilters: Partial<IcpFilters> | undefined;
    let transcripts: string[] = [];
    const sources: ProcessedSource[] = [];

    for await (const part of parts) {
      if (part.type === 'field') {
        const value = String(part.value);
        switch (part.fieldname) {
          case 'name':
            name = value;
            break;
          case 'description':
            description = value;
            break;
          case 'generatePersona':
            generatePersona = value === 'true';
            break;
          case 'classicFilters':
            classicFilters = JSON.parse(value);
            break;
          case 'transcripts':
            transcripts = JSON.parse(value);
            break;
        }
      } else if (part.type === 'file') {
        const buffer = await part.toBuffer();
        if (part.fieldname === 'crmCsv' || part.filename?.endsWith('.csv')) {
          sources.push(await container.sourceProcessor.processCrmCsv(buffer));
        } else if (ALLOWED_DOC_TYPES.has(part.mimetype)) {
          sources.push(
            await container.sourceProcessor.processDocument(buffer, part.mimetype, part.filename),
          );
        }
      }
    }

    if (!name) return reply.status(400).send({ error: 'name field is required' });

    // Add transcript sources
    for (const text of transcripts) {
      if (text.trim()) {
        sources.push(container.sourceProcessor.processTranscript(text));
      }
    }

    // Add classic selectors source
    if (classicFilters) {
      sources.push(container.sourceProcessor.processClassicSelectors(classicFilters));
    }

    // Create the ICP record first
    const [icp] = await db
      .insert(schema.icps)
      .values({
        clientId: request.params.clientId,
        name,
        description,
      })
      .returning();

    if (sources.length === 0) {
      // No sources — just return the empty ICP
      return reply.status(201).send({ data: { icp } });
    }

    // Parse all sources
    const result = await container.icpParser.parseFromSources({
      sources,
      clientId: request.params.clientId,
      generatePersona,
    });

    const sourceRecords: IcpSourceRecord[] = sources.map(s => ({
      sourceType: s.sourceType,
      fileName: s.metadata.fileName as string | undefined,
      addedAt: new Date().toISOString(),
      contribution: result.sourceContributions[s.sourceType] ?? [],
    }));

    // Insert auto-generated persona
    let suggestedPersonaId: string | undefined;
    if (result.suggestedPersona) {
      const [persona] = await db
        .insert(schema.personas)
        .values({
          icpId: icp.id,
          name: result.suggestedPersona.name,
          description: result.suggestedPersona.reasoning,
          titlePatterns: result.suggestedPersona.titlePatterns,
          seniorityLevels: result.suggestedPersona.seniorityLevels,
          departments: result.suggestedPersona.departments,
          isAutoGenerated: true,
          generatedFromIcpId: icp.id,
        })
        .returning();
      suggestedPersonaId = persona.id;
    }

    // Update ICP with parsed data
    const [updated] = await db
      .update(schema.icps)
      .set({
        filters: result.filters,
        sources: sourceRecords,
        providerHints: result.providerHints,
        suggestedPersonaId,
        aiParsingConfidence: String(result.confidence),
        lastParsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.icps.id, icp.id))
      .returning();

    return reply.status(201).send({
      data: {
        icp: updated,
        providerHints: result.providerHints,
        suggestedPersona: result.suggestedPersona,
        sourceContributions: result.sourceContributions,
        confidence: result.confidence,
      },
    });
  });
};
