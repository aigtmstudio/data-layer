import type { UnifiedCompany, UnifiedContact } from '../types.js';
import type {
  LinkedInCompanyResult,
  LinkedInProfileResult,
  SocialPost,
  InstagramPost,
  Tweet,
  YouTubeVideo,
  RedditPost,
  LinkedInPost,
  GooglePlaceResult,
  OpenTableListing,
  UberEatsListing,
  JustEatListing,
} from './types.js';

export function mapLinkedInCompany(raw: LinkedInCompanyResult): UnifiedCompany {
  const domain = extractDomain(raw.website);

  return {
    name: raw.name ?? 'Unknown',
    domain,
    websiteUrl: raw.website,
    linkedinUrl: raw.linkedinUrl,
    industry: raw.industry,
    employeeRange: raw.companySize,
    employeeCount: parseEmployeeCount(raw.companySize),
    description: raw.description?.slice(0, 1000),
    foundedYear: raw.foundedYear,
    logoUrl: raw.logo,
    techStack: raw.specialties ?? [],
    externalIds: { apify: raw.linkedinUrl ?? '' },
  };
}

export function mapLinkedInProfile(raw: LinkedInProfileResult): UnifiedContact {
  return {
    firstName: raw.firstName,
    lastName: raw.lastName,
    fullName: raw.fullName ?? [raw.firstName, raw.lastName].filter(Boolean).join(' '),
    linkedinUrl: raw.linkedinUrl,
    photoUrl: raw.profilePicture,
    title: raw.jobTitle ?? raw.headline,
    companyName: raw.companyName,
    companyDomain: extractDomain(raw.companyWebsite),
    workEmail: raw.email,
    city: parseLocation(raw.location)?.city,
    state: parseLocation(raw.location)?.state,
    country: parseLocation(raw.location)?.country,
    employmentHistory: raw.experience?.map(exp => ({
      company: exp.company ?? '',
      title: exp.title ?? '',
      startDate: exp.startDate,
      endDate: exp.endDate,
      isCurrent: exp.current ?? false,
    })),
    externalIds: { apify: raw.linkedinUrl ?? '' },
  };
}

// ── Social post mappers ────────────────────────────────────────────────────

export function mapInstagramPost(raw: InstagramPost): SocialPost {
  return {
    platform: 'instagram',
    id: raw.id ?? raw.shortCode ?? '',
    url: raw.url ?? `https://www.instagram.com/p/${raw.shortCode ?? ''}`,
    text: raw.caption ?? '',
    authorHandle: raw.ownerUsername,
    authorName: raw.ownerFullName,
    publishedAt: raw.timestamp,
    likesCount: raw.likesCount,
    commentsCount: raw.commentsCount,
    viewsCount: raw.videoViewCount,
    rawData: raw,
  };
}

export function mapTweet(raw: Tweet): SocialPost {
  return {
    platform: 'twitter',
    id: raw.id ?? '',
    url: raw.url ?? raw.tweetUrl ?? '',
    text: raw.text ?? raw.full_text ?? '',
    authorHandle: raw.author?.username ?? raw.user?.screen_name,
    authorName: raw.author?.name ?? raw.user?.name,
    publishedAt: raw.createdAt ?? raw.created_at,
    likesCount: raw.likeCount ?? raw.favorite_count,
    commentsCount: raw.replyCount ?? raw.reply_count,
    sharesCount: raw.retweetCount ?? raw.retweet_count,
    viewsCount: raw.viewCount,
    rawData: raw,
  };
}

export function mapYouTubeVideo(raw: YouTubeVideo): SocialPost {
  const id = raw.id ?? raw.videoId ?? '';
  const url = raw.url ?? raw.link ?? (id ? `https://youtube.com/watch?v=${id}` : '');
  return {
    platform: 'youtube',
    id,
    url,
    text: [raw.title, raw.description ?? raw.text].filter(Boolean).join('\n\n'),
    authorHandle: raw.channelUrl,
    authorName: raw.channelName ?? raw.channelTitle ?? raw.author,
    publishedAt: raw.publishedAt ?? raw.uploadDate ?? raw.date,
    likesCount: raw.likeCount !== undefined ? Number(raw.likeCount) : (raw.likes !== undefined ? Number(raw.likes) : undefined),
    commentsCount: raw.commentCount !== undefined ? Number(raw.commentCount) : (raw.comments !== undefined ? Number(raw.comments) : undefined),
    viewsCount: raw.viewCount !== undefined ? Number(raw.viewCount) : (raw.views !== undefined ? Number(raw.views) : undefined),
    rawData: raw,
  };
}

export function mapRedditPost(raw: RedditPost): SocialPost {
  const body = raw.body ?? raw.text ?? raw.selftext ?? '';
  const publishedAt = raw.createdAt
    ?? (raw.createdUtc ? new Date(raw.createdUtc * 1000).toISOString() : undefined)
    ?? (raw.created_utc ? new Date(raw.created_utc * 1000).toISOString() : undefined);
  return {
    platform: 'reddit',
    id: raw.id ?? '',
    url: raw.url ?? raw.postUrl ?? '',
    text: [raw.title, body].filter(Boolean).join('\n\n'),
    authorHandle: raw.author ?? raw.username,
    authorName: raw.author ?? raw.username,
    publishedAt,
    likesCount: raw.score ?? raw.upvotes,
    commentsCount: raw.numberOfComments ?? raw.numComments ?? raw.commentsCount,
    rawData: raw,
  };
}

export function mapLinkedInPost(raw: LinkedInPost): SocialPost {
  return {
    platform: 'linkedin',
    id: raw.id ?? '',
    url: raw.linkedinUrl ?? '',
    text: raw.content ?? '',
    authorHandle: raw.author?.universalName,
    authorName: raw.author?.name,
    publishedAt: raw.postedAt?.date,
    likesCount: raw.engagement?.likes,
    commentsCount: raw.engagement?.comments,
    sharesCount: raw.engagement?.shares,
    rawData: raw,
  };
}

// ── Google Places mapper ───────────────────────────────────────────────────

export function mapGooglePlaceToCompany(raw: GooglePlaceResult): UnifiedCompany {
  const domain = extractDomain(raw.website);
  return {
    name: raw.title ?? 'Unknown',
    domain,
    websiteUrl: raw.website,
    phone: raw.phone,
    address: raw.address,
    city: raw.city,
    country: raw.country,
    description: raw.description?.slice(0, 1000),
    industry: raw.categoryName ?? raw.categories?.[0],
    externalIds: { googlePlaces: raw.placeId ?? '' },
  };
}

// ── Listing platform mappers ───────────────────────────────────────────────

export function mapOpenTableListing(raw: OpenTableListing): UnifiedCompany {
  return {
    name: raw.name ?? 'Unknown',
    domain: extractDomain(raw.website),
    websiteUrl: raw.website,
    phone: raw.phone,
    city: raw.city,
    industry: raw.cuisine ?? 'Restaurant',
    externalIds: { opentable: raw.restaurantId ?? '' },
  };
}

export function mapUberEatsListing(raw: UberEatsListing): UnifiedCompany {
  return {
    name: raw.title ?? 'Unknown',
    domain: extractDomain(raw.website),
    websiteUrl: raw.website,
    city: raw.city,
    address: raw.address,
    industry: raw.categories?.[0] ?? 'Restaurant',
    externalIds: { ubereats: raw.uuid ?? '' },
  };
}

export function mapJustEatListing(raw: JustEatListing): UnifiedCompany {
  return {
    name: raw.name ?? 'Unknown',
    domain: extractDomain(raw.website),
    websiteUrl: raw.website,
    city: raw.city,
    address: raw.address,
    industry: raw.cuisines?.[0]?.name ?? 'Restaurant',
    externalIds: { justeat: raw.id ?? '' },
  };
}

function extractDomain(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

function parseEmployeeCount(range?: string): number | undefined {
  if (!range) return undefined;
  // Formats like "1001-5000", "51-200", "10001+"
  const match = range.match(/(\d[\d,]*)/);
  if (!match) return undefined;
  return parseInt(match[1].replace(/,/g, ''), 10);
}

function parseLocation(location?: string): { city?: string; state?: string; country?: string } | undefined {
  if (!location) return undefined;
  const parts = location.split(',').map(p => p.trim());
  if (parts.length >= 3) return { city: parts[0], state: parts[1], country: parts[2] };
  if (parts.length === 2) return { city: parts[0], country: parts[1] };
  return { city: parts[0] };
}
