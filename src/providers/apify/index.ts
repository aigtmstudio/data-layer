import { BaseProvider } from '../base.js';
import type {
  DataProvider,
  ProviderCapability,
  CompanyEnrichParams,
  PeopleEnrichParams,
  UnifiedCompany,
  UnifiedContact,
  ProviderResponse,
} from '../types.js';
import {
  mapLinkedInCompany,
  mapLinkedInProfile,
  mapInstagramPost,
  mapTweet,
  mapYouTubeVideo,
  mapRedditPost,
  mapLinkedInPost,
  mapGooglePlaceToCompany,
  mapOpenTableListing,
  mapUberEatsListing,
  mapJustEatListing,
} from './mappers.js';
import { ACTORS } from './actors.js';
import type {
  ApifyRunResponse,
  ApifyRun,
  LinkedInCompanyResult,
  LinkedInProfileResult,
  SocialPost,
  SocialPlatform,
  InstagramPost,
  Tweet,
  YouTubeVideo,
  RedditPost,
  LinkedInPost,
  GooglePlaceResult,
  OpenTableListing,
  UberEatsListing,
  JustEatListing,
  ListingPlatform,
} from './types.js';

const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 min — actors can run up to 8 min
const WAIT_FOR_FINISH = '60';
const REQUEST_TIMEOUT = 90_000;

export class ApifyProvider extends BaseProvider implements DataProvider {
  readonly name = 'apify';
  readonly displayName = 'Apify';
  readonly capabilities: ProviderCapability[] = [
    'company_enrich', 'people_enrich',
  ];

  constructor(apiKey: string) {
    super({
      apiKey,
      baseUrl: 'https://api.apify.com/v2',
      rateLimit: { perSecond: 10, perMinute: 300 },
    });
    this.log = this.log.child({ provider: this.name });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  async enrichCompany(params: CompanyEnrichParams): Promise<ProviderResponse<UnifiedCompany>> {
    try {
      // Build LinkedIn company URL from domain
      const companyUrl = params.domain
        ? `https://www.linkedin.com/company/${params.domain.replace(/\.[^.]+$/, '')}/`
        : undefined;

      if (!companyUrl && !params.name) {
        return {
          success: false, data: null, error: 'Domain or name required',
          creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
        };
      }

      const input = {
        companyUrls: companyUrl ? [companyUrl] : [],
        ...(params.name && !companyUrl ? { searchQueries: [params.name] } : {}),
      };

      const items = await this.runActor<LinkedInCompanyResult>(
        ACTORS.LINKEDIN_COMPANY_SCRAPER,
        input,
      );

      if (!items.length) {
        return {
          success: false, data: null, error: 'No company data found',
          creditsConsumed: 1, fieldsPopulated: [], qualityScore: 0,
        };
      }

      const unified = mapLinkedInCompany(items[0]);

      // Override domain with the requested one if available
      if (params.domain) {
        unified.domain = params.domain;
      }

      const fieldsPopulated = this.getPopulatedFields(unified as unknown as Record<string, unknown>);

      return {
        success: true,
        data: unified,
        creditsConsumed: 1,
        fieldsPopulated,
        qualityScore: Math.min(fieldsPopulated.length / 15, 1),
      };
    } catch (error) {
      this.log.error({ error, params }, 'Company enrichment failed');
      return {
        success: false, data: null, error: String(error),
        creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
      };
    }
  }

  async enrichPerson(params: PeopleEnrichParams): Promise<ProviderResponse<UnifiedContact>> {
    try {
      if (!params.linkedinUrl) {
        return {
          success: false, data: null, error: 'LinkedIn URL required for Apify enrichment',
          creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
        };
      }

      const input = {
        profileUrls: [params.linkedinUrl],
      };

      const items = await this.runActor<LinkedInProfileResult>(
        ACTORS.LINKEDIN_PROFILE_SCRAPER,
        input,
      );

      if (!items.length) {
        return {
          success: false, data: null, error: 'No profile data found',
          creditsConsumed: 1, fieldsPopulated: [], qualityScore: 0,
        };
      }

      const unified = mapLinkedInProfile(items[0]);
      const fieldsPopulated = this.getPopulatedFields(unified as unknown as Record<string, unknown>);

      return {
        success: true,
        data: unified,
        creditsConsumed: 1,
        fieldsPopulated,
        qualityScore: Math.min(fieldsPopulated.length / 12, 1),
      };
    } catch (error) {
      this.log.error({ error, params }, 'Person enrichment failed');
      return {
        success: false, data: null, error: String(error),
        creditsConsumed: 0, fieldsPopulated: [], qualityScore: 0,
      };
    }
  }

  // ── Social monitoring ──────────────────────────────────────────────────

  async searchSocialPosts(params: {
    platform: SocialPlatform;
    keywords: string[];
    limit?: number;
  }): Promise<SocialPost[]> {
    const limit = params.limit ?? 20;
    const query = params.keywords.join(' OR ');

    switch (params.platform) {
      case 'instagram': {
        const items = await this.runActor<InstagramPost>(ACTORS.INSTAGRAM_SCRAPER, {
          hashtags: params.keywords,
          resultsLimit: limit,
          resultsType: 'posts',
        });
        return items.map(mapInstagramPost);
      }
      case 'twitter': {
        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const start = yesterday.toISOString().split('T')[0];
        const end = now.toISOString().split('T')[0];
        const items = await this.runActor<Tweet>(ACTORS.TWITTER_SCRAPER, {
          searchTerms: params.keywords,
          maxItems: Math.min(limit, 15),
          sort: 'Latest',
          start,
          end,
          tweetLanguage: 'en',
          onlyVerifiedUsers: true,
          onlyTwitterBlue: false,
          onlyImage: false,
          onlyVideo: false,
          onlyQuote: false,
          includeSearchTerms: false,
          customMapFunction: '(object) => { return {...object} }',
        });
        return items.map(mapTweet);
      }
      case 'youtube': {
        const items = await this.runActor<YouTubeVideo>(ACTORS.YOUTUBE_SCRAPER, {
          searchQueries: params.keywords.slice(0, 5), // capped per docs
          maxResults: Math.min(limit, 15),
          maxResultsShorts: 0,
          maxResultStreams: 0,
          dateFilter: 'week',
          sortingOrder: 'date',
          downloadSubtitles: true,
          preferAutoGeneratedSubtitles: false,
          saveSubsToKVS: false,
          hasCC: false,
          hasSubtitles: false,
          hasLocation: false,
          is360: false,
          is3D: false,
          is4K: false,
          isHD: false,
          isHDR: false,
          isLive: false,
          isVR180: false,
          isBought: false,
        });
        return items.map(mapYouTubeVideo);
      }
      case 'reddit': {
        const items = await this.runActor<RedditPost>(ACTORS.REDDIT_SCRAPER, {
          searchTerms: params.keywords,
          searchPosts: true,
          searchComments: false,
          searchCommunities: false,
          maxPostsCount: Math.min(limit, 15),
          maxCommentsCount: 0,
          maxCommentsPerPost: 0,
          maxCommunitiesCount: 0,
          crawlCommentsPerPost: false,
          includeNSFW: false,
          searchSort: 'new',
          searchTime: 'day',
          fastMode: false,
          proxy: {
            useApifyProxy: true,
            apifyProxyGroups: ['RESIDENTIAL'],
          },
        });
        return items.map(mapRedditPost);
      }
      case 'linkedin': {
        const items = await this.runActor<LinkedInPost>(ACTORS.LINKEDIN_POSTS_SCRAPER, {
          searchQueries: params.keywords,
          maxPosts: Math.min(limit, 15),
          sortBy: 'date',
          postedLimit: '24h',
          scrapeComments: false,
          scrapeReactions: false,
          maxReactions: 5,
          scrapePages: 1,
          profileScraperMode: 'short',
          startPage: 1,
        });
        return items.map(mapLinkedInPost);
      }
    }
  }

  async fetchInfluencerPosts(params: {
    platform: SocialPlatform;
    profileUrl: string;
    limit?: number;
  }): Promise<SocialPost[]> {
    const limit = params.limit ?? 10;

    switch (params.platform) {
      case 'instagram': {
        const items = await this.runActor<InstagramPost>(ACTORS.INSTAGRAM_SCRAPER, {
          directUrls: [params.profileUrl],
          resultsLimit: limit,
          resultsType: 'posts',
        });
        return items.map(mapInstagramPost);
      }
      case 'twitter': {
        const items = await this.runActor<Tweet>(ACTORS.TWITTER_SCRAPER, {
          startUrls: [{ url: params.profileUrl }],
          maxItems: limit,
          sort: 'Latest',
          customMapFunction: '(object) => { return {...object} }',
        });
        return items.map(mapTweet);
      }
      case 'youtube': {
        const items = await this.runActor<YouTubeVideo>(ACTORS.YOUTUBE_SCRAPER, {
          startUrls: [{ url: params.profileUrl }],
          maxResults: limit,
          sortingOrder: 'date',
          downloadSubtitles: true,
          preferAutoGeneratedSubtitles: false,
          saveSubsToKVS: false,
        });
        return items.map(mapYouTubeVideo);
      }
      case 'reddit': {
        const items = await this.runActor<RedditPost>(ACTORS.REDDIT_SCRAPER, {
          startUrls: [{ url: params.profileUrl }],
          maxPostsCount: limit,
          searchPosts: true,
          searchComments: false,
          proxy: {
            useApifyProxy: true,
            apifyProxyGroups: ['RESIDENTIAL'],
          },
        });
        return items.map(mapRedditPost);
      }
      case 'linkedin': {
        const items = await this.runActor<LinkedInPost>(ACTORS.LINKEDIN_POSTS_SCRAPER, {
          profileUrls: [params.profileUrl],
          maxPosts: limit,
          scrapeComments: false,
          scrapeReactions: false,
        });
        return items.map(mapLinkedInPost);
      }
    }
  }

  // ── Company discovery ──────────────────────────────────────────────────

  async searchGooglePlaces(params: {
    query: string;
    location: string;
    limit?: number;
    includeReviews?: boolean;
  }): Promise<GooglePlaceResult[]> {
    return this.runActor<GooglePlaceResult>(ACTORS.GOOGLE_PLACES, {
      searchStringsArray: [`${params.query} in ${params.location}`],
      maxCrawledPlacesPerSearch: params.limit ?? 50,
      includeReviews: params.includeReviews ?? false,
      maxReviews: params.includeReviews ? 20 : 0,
      language: 'en',
    });
  }

  async searchListings(params: {
    platform: ListingPlatform;
    location: string;
    limit?: number;
  }): Promise<UnifiedCompany[]> {
    const limit = params.limit ?? 50;

    switch (params.platform) {
      case 'opentable': {
        const items = await this.runActor<OpenTableListing>(ACTORS.OPENTABLE_SCRAPER, {
          location: params.location,
          maxItems: limit,
        });
        return items.map(mapOpenTableListing);
      }
      case 'ubereats': {
        const items = await this.runActor<UberEatsListing>(ACTORS.UBEREATS_SCRAPER, {
          location: params.location,
          maxItems: limit,
        });
        return items.map(mapUberEatsListing);
      }
      case 'justeat': {
        const items = await this.runActor<JustEatListing>(ACTORS.JUSTEAT_SCRAPER, {
          location: params.location,
          maxItems: limit,
        });
        return items.map(mapJustEatListing);
      }
    }
  }

  private async runActor<T>(actorSlug: string, input: unknown): Promise<T[]> {
    // Step 1: Start run with waitForFinish
    const runResponse = await this.request<ApifyRunResponse>(
      'post',
      `/acts/${actorSlug}/runs`,
      {
        body: input,
        params: { waitForFinish: WAIT_FOR_FINISH },
        timeout: REQUEST_TIMEOUT,
      },
    );

    let run = runResponse.data;

    // Step 2: Poll until terminal status
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (run.status === 'RUNNING' || run.status === 'READY') {
      if (Date.now() > deadline) throw new Error('Actor run timed out');
      await sleep(5000);

      const pollResponse = await this.request<ApifyRunResponse>(
        'get',
        `/acts/${actorSlug}/runs/${run.id}`,
        {
          params: { waitForFinish: WAIT_FOR_FINISH },
          timeout: REQUEST_TIMEOUT,
        },
      );
      run = pollResponse.data;
    }

    if (run.status !== 'SUCCEEDED') {
      throw new Error(`Actor run ${run.status}: ${run.statusMessage ?? 'unknown error'}`);
    }

    // Step 3: Fetch dataset items
    // The /datasets/{id}/items endpoint returns a direct JSON array, not wrapped in { data: { items: [] } }
    const items = await this.request<T[]>(
      'get',
      `/datasets/${run.defaultDatasetId}/items`,
      { params: { format: 'json', limit: '100' } },
    );

    return Array.isArray(items) ? items : [];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
