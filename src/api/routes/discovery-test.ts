import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import type { ServiceContainer } from '../../index.js';
import type { ApifyProvider } from '../../providers/apify/index.js';
import type { ExaProvider } from '../../providers/exa/index.js';
import type { TavilyProvider } from '../../providers/tavily/index.js';
import { mapGooglePlaceToCompany } from '../../providers/apify/mappers.js';
import { logger } from '../../lib/logger.js';

interface DiscoveryTestOpts {
  container: ServiceContainer;
  providers: {
    apify?: ApifyProvider;
    exa?: ExaProvider;
    tavily?: TavilyProvider;
    anthropicApiKey?: string;
  };
}

const PLATFORM_DOMAINS: Record<string, string[]> = {
  opentable: ['opentable.co.uk', 'opentable.com'],
  ubereats: ['ubereats.com'],
  justeat: ['just-eat.co.uk'],
};

export const discoveryTestRoutes: FastifyPluginAsync<DiscoveryTestOpts> = async (app, opts) => {
  const log = logger.child({ route: 'discovery-test' });
  const { apify, exa, tavily, anthropicApiKey } = opts.providers;

  // ── 1. Google Places ──────────────────────────────────────────────────────

  app.post('/google-places', async (request, reply) => {
    const body = z.object({
      query: z.string().min(1).default('restaurant'),
      location: z.string().min(1),
      limit: z.number().int().min(1).max(20).default(5),
    }).parse(request.body);

    if (!apify) return reply.status(503).send({ error: 'Apify provider not configured' });

    log.info(body, 'Testing Google Places discovery');
    const startMs = Date.now();

    const places = await apify.searchGooglePlaces({
      query: body.query,
      location: body.location,
      limit: body.limit,
    });

    const mapped = places.map(mapGooglePlaceToCompany);

    return {
      data: {
        method: 'google-places',
        durationMs: Date.now() - startMs,
        stats: { searched: places.length, mapped: mapped.length },
        rawPlaces: places.map(p => ({
          title: p.title,
          address: p.address,
          phone: p.phone,
          website: p.website,
          rating: p.totalScore,
          reviewCount: p.reviewsCount,
          categories: p.categories,
        })),
        mappedCompanies: mapped.map(c => ({
          name: c.name,
          domain: c.domain,
          website: c.websiteUrl,
          phone: c.phone,
          address: c.address,
          city: c.city,
          industry: c.industry,
        })),
      },
    };
  });

  // ── 2. Reviews ────────────────────────────────────────────────────────────

  app.post('/reviews', async (request, reply) => {
    const body = z.object({
      location: z.string().min(1),
      category: z.string().default('restaurant'),
      limit: z.number().int().min(1).max(20).default(10),
    }).parse(request.body);

    if (!apify) return reply.status(503).send({ error: 'Apify provider not configured' });
    if (!anthropicApiKey) return reply.status(503).send({ error: 'Anthropic API key not configured' });

    log.info(body, 'Testing review discovery');
    const startMs = Date.now();

    const places = await apify.searchGooglePlaces({
      query: body.category,
      location: body.location,
      limit: body.limit,
      includeReviews: true,
    });

    // Filter to places with ≤3 star reviews (mirrors production logic)
    const placesWithReviews = places
      .filter(p => p.reviews && p.reviews.length > 0)
      .slice(0, 50);

    const reviewSummary = placesWithReviews.map(p => ({
      name: p.title,
      reviews: p.reviews?.filter(r => r.stars && r.stars <= 3).map(r => r.text).slice(0, 3),
    })).filter(p => p.reviews && p.reviews.length > 0);

    let llmPrompt = '';
    let llmResponse = '';
    let matchedBusinesses: string[] = [];

    if (reviewSummary.length > 0) {
      llmPrompt = `Identify businesses from this list that have negative reviews specifically about payment processing, card machines, card payments, checkout, or billing issues.\n\n${JSON.stringify(reviewSummary, null, 2)}\n\nReturn ONLY a JSON array of business names: ["Restaurant A", "Café B"]. Return [] if none found.`;

      const anthropic = new Anthropic({ apiKey: anthropicApiKey });
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{ role: 'user', content: llmPrompt }],
      });

      llmResponse = response.content.find(b => b.type === 'text')?.text ?? '';
      const jsonMatch = llmResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        matchedBusinesses = JSON.parse(jsonMatch[0]) as string[];
      }
    }

    return {
      data: {
        method: 'reviews',
        durationMs: Date.now() - startMs,
        stats: {
          placesSearched: places.length,
          withReviews: placesWithReviews.length,
          withNegativeReviews: reviewSummary.length,
          matchedByLlm: matchedBusinesses.length,
        },
        reviewSummary,
        llmPrompt,
        llmResponse,
        matchedBusinesses,
      },
    };
  });

  // ── 3. News ───────────────────────────────────────────────────────────────

  app.post('/news', async (request, reply) => {
    const body = z.object({
      queries: z.array(z.string().min(1)).min(1).max(3),
      limit: z.number().int().min(1).max(10).default(3),
    }).parse(request.body);

    if (!tavily) return reply.status(503).send({ error: 'Tavily provider not configured' });
    if (!anthropicApiKey) return reply.status(503).send({ error: 'Anthropic API key not configured' });

    log.info(body, 'Testing news discovery');
    const startMs = Date.now();

    const allArticles: Array<{ title: string; content: string; url: string }> = [];

    for (const query of body.queries) {
      const response = await tavily.searchNews({ query, maxResults: body.limit, days: 30 });
      if (response.results?.length) {
        allArticles.push(...response.results.map(r => ({
          title: r.title ?? query,
          content: r.content?.slice(0, 500) ?? '',
          url: r.url ?? '',
        })));
      }
    }

    let llmPrompt = '';
    let llmResponse = '';
    let extractedCompanies: Array<{ name: string; website?: string; city?: string; description?: string }> = [];

    if (allArticles.length > 0) {
      const articleSummary = allArticles
        .slice(0, 20)
        .map(a => `Title: ${a.title}\nExcerpt: ${a.content}`)
        .join('\n---\n');

      llmPrompt = `Extract real business names from these news articles. Focus on restaurants, hospitality venues, or food service businesses that are opening, expanding, or refurbishing.\n\nArticles:\n${articleSummary}\n\nReturn ONLY a valid JSON array of objects: [{"name": "Restaurant Name", "website": "example.com", "city": "London", "description": "one sentence"}]\nOmit website/city if unknown. Return [] if none found.`;

      const anthropic = new Anthropic({ apiKey: anthropicApiKey });
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: llmPrompt }],
      });

      llmResponse = response.content.find(b => b.type === 'text')?.text ?? '';
      const jsonMatch = llmResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        extractedCompanies = JSON.parse(jsonMatch[0]);
      }
    }

    return {
      data: {
        method: 'news',
        durationMs: Date.now() - startMs,
        stats: {
          queriesRun: body.queries.length,
          articlesFound: allArticles.length,
          companiesExtracted: extractedCompanies.length,
        },
        articles: allArticles,
        llmPrompt,
        llmResponse,
        extractedCompanies,
      },
    };
  });

  // ── 4. Listings (Exa domain-scoped search) ────────────────────────────────

  app.post('/listings', async (request, reply) => {
    const body = z.object({
      platform: z.enum(['opentable', 'ubereats', 'justeat']),
      location: z.string().min(1),
      limit: z.number().int().min(1).max(20).default(5),
    }).parse(request.body);

    if (!exa) return reply.status(503).send({ error: 'Exa provider not configured' });

    log.info(body, 'Testing listing discovery');
    const startMs = Date.now();

    const domains = PLATFORM_DOMAINS[body.platform];
    const query = `restaurants in ${body.location}`;

    const rawResults = await exa.searchWithDomains(query, domains, body.limit);

    // Strip platform suffix from titles (mirrors production logic)
    const mapped = rawResults
      .filter(r => r.title)
      .map(r => {
        const name = r.title!.split(/\s*[-|]\s*/)[0].trim();
        return { name, url: r.url, text: r.text?.slice(0, 200) };
      })
      .filter(r => r.name.length >= 2);

    return {
      data: {
        method: 'listings',
        durationMs: Date.now() - startMs,
        stats: { searched: rawResults.length, mapped: mapped.length },
        query,
        domains,
        rawResults: rawResults.map(r => ({
          title: r.title,
          url: r.url,
          text: r.text?.slice(0, 200),
          score: r.score,
        })),
        mappedCompanies: mapped,
      },
    };
  });

  // ── 5. Social Media Posts ─────────────────────────────────────────────────

  app.post('/social', async (request, reply) => {
    const body = z.object({
      platform: z.enum(['instagram', 'twitter', 'youtube', 'reddit', 'linkedin']),
      keywords: z.array(z.string().min(1)).min(1).max(5),
      limit: z.number().int().min(1).max(10).default(3),
    }).parse(request.body);

    if (!apify) return reply.status(503).send({ error: 'Apify provider not configured' });

    log.info(body, 'Testing social media search');
    const startMs = Date.now();

    const posts = await apify.searchSocialPosts({
      platform: body.platform,
      keywords: body.keywords,
      limit: body.limit,
    });

    return {
      data: {
        method: 'social',
        durationMs: Date.now() - startMs,
        stats: { fetched: posts.length },
        platform: body.platform,
        keywords: body.keywords,
        posts: posts.map(p => ({
          platform: p.platform,
          url: p.url,
          text: p.text?.slice(0, 300),
          authorHandle: p.authorHandle,
          authorName: p.authorName,
          publishedAt: p.publishedAt,
          likesCount: p.likesCount,
          commentsCount: p.commentsCount,
          sharesCount: p.sharesCount,
          viewsCount: p.viewsCount,
        })),
      },
    };
  });

  // ── 6. Social → Companies (LLM extraction, dry-run) ─────────────────────

  app.post('/social-companies', async (request, reply) => {
    const body = z.object({
      platform: z.enum(['instagram', 'twitter', 'youtube', 'reddit', 'linkedin']),
      keywords: z.array(z.string().min(1)).min(1).max(5),
      limit: z.number().int().min(1).max(10).default(5),
    }).parse(request.body);

    if (!apify) return reply.status(503).send({ error: 'Apify provider not configured' });
    if (!anthropicApiKey) return reply.status(503).send({ error: 'Anthropic API key not configured' });

    log.info(body, 'Testing social → company extraction');
    const startMs = Date.now();

    const posts = await apify.searchSocialPosts({
      platform: body.platform,
      keywords: body.keywords,
      limit: body.limit,
    });

    let llmPrompt = '';
    let llmResponse = '';
    let extractedCompanies: Array<{ name: string; website?: string; city?: string; source?: string; reasoning?: string }> = [];

    if (posts.length > 0) {
      const postSummary = posts.slice(0, 30).map((p, i) => {
        const author = [p.authorName, p.authorHandle ? `@${p.authorHandle}` : ''].filter(Boolean).join(' ');
        const text = (p.text ?? '').slice(0, 300);
        return `${i + 1}. [${p.platform}] Author: ${author || 'unknown'}\n   ${text}`;
      }).join('\n\n');

      llmPrompt = `You are extracting potential target companies from social media posts.

Extract any businesses that appear to be real companies (not individuals or platforms).

From these social media posts, extract any businesses that could be potential customers:

${postSummary}

For each business found, provide:
- name: the business name
- website: domain if mentioned or inferrable (omit if unknown)
- city: location if mentioned (omit if unknown)
- source: "author" if the post author works at or owns the company, or "mention" if named in the post text
- reasoning: one sentence on why they match

Return ONLY valid JSON: [{"name": "...", "website": "...", "city": "...", "source": "...", "reasoning": "..."}]
Return [] if none found.`;

      const anthropic = new Anthropic({ apiKey: anthropicApiKey });
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: llmPrompt }],
      });

      llmResponse = response.content.find(b => b.type === 'text')?.text ?? '';
      const jsonMatch = llmResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        extractedCompanies = JSON.parse(jsonMatch[0]);
      }
    }

    return {
      data: {
        method: 'social-companies',
        durationMs: Date.now() - startMs,
        stats: {
          postsFetched: posts.length,
          companiesExtracted: extractedCompanies.length,
        },
        posts: posts.map(p => ({
          platform: p.platform,
          url: p.url,
          text: p.text?.slice(0, 300),
          authorHandle: p.authorHandle,
          authorName: p.authorName,
        })),
        llmPrompt,
        llmResponse,
        extractedCompanies,
      },
    };
  });

  // ── 7. Evidence Search (Exa news/tweets) ──────────────────────────────────

  app.post('/evidence', async (request, reply) => {
    const body = z.object({
      query: z.string().min(1),
      category: z.enum(['news', 'tweet']).default('news'),
      limit: z.number().int().min(1).max(10).default(3),
    }).parse(request.body);

    if (!exa) return reply.status(503).send({ error: 'Exa provider not configured' });

    log.info(body, 'Testing evidence search');
    const startMs = Date.now();

    const response = await exa.searchNews({
      query: body.query,
      numResults: body.limit,
      category: body.category,
    });

    return {
      data: {
        method: 'evidence',
        durationMs: Date.now() - startMs,
        stats: { found: response.results.length },
        query: body.query,
        category: body.category,
        results: response.results.map(r => ({
          title: r.title,
          url: r.url,
          author: r.author,
          publishedDate: r.publishedDate,
          text: r.text?.slice(0, 300),
          score: r.score,
        })),
      },
    };
  });
};
