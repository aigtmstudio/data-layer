export interface ApifyRunResponse {
  data: ApifyRun;
}

export interface ApifyRun {
  id: string;
  actId: string;
  status: 'READY' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED-OUT' | 'ABORTED';
  statusMessage?: string;
  defaultDatasetId: string;
  defaultKeyValueStoreId: string;
  startedAt?: string;
  finishedAt?: string;
  stats?: {
    computeUnits?: number;
    runTimeSecs?: number;
  };
  usageTotalUsd?: number;
}

export interface ApifyDatasetResponse<T> {
  data: {
    items: T[];
    total: number;
    offset: number;
    limit: number;
    count: number;
  };
}

export interface LinkedInCompanyResult {
  name?: string;
  linkedinUrl?: string;
  website?: string;
  industry?: string;
  companySize?: string;
  description?: string;
  headquarters?: string;
  foundedYear?: number;
  followerCount?: number;
  specialties?: string[];
  logo?: string;
}

// ── Social monitoring ──────────────────────────────────────────────────────

export type SocialPlatform = 'instagram' | 'twitter' | 'youtube' | 'reddit' | 'linkedin';

export interface SocialPost {
  platform: SocialPlatform;
  id: string;
  url: string;
  text: string;
  authorHandle?: string;
  authorName?: string;
  publishedAt?: string;
  likesCount?: number;
  commentsCount?: number;
  sharesCount?: number;
  viewsCount?: number;
  rawData: unknown;
}

// Raw actor result types

export interface InstagramPost {
  id?: string;
  url?: string;
  shortCode?: string;
  caption?: string;
  timestamp?: string;
  ownerUsername?: string;
  ownerFullName?: string;
  likesCount?: number;
  commentsCount?: number;
  videoViewCount?: number;
}

export interface Tweet {
  id?: string;
  url?: string;
  full_text?: string;
  text?: string;
  created_at?: string;
  author?: { userName?: string; name?: string };
  replyCount?: number;
  retweetCount?: number;
  likeCount?: number;
  viewCount?: number;
}

export interface YouTubeVideo {
  id?: string;
  url?: string;
  title?: string;
  description?: string;
  date?: string;
  channelName?: string;
  channelUrl?: string;
  likes?: number;
  comments?: number;
  views?: number;
}

export interface RedditPost {
  id?: string;
  url?: string;
  title?: string;
  text?: string;
  selftext?: string;
  created_utc?: number;
  author?: string;
  score?: number;
  num_comments?: number;
}

export interface LinkedInPost {
  id?: string;
  url?: string;
  text?: string;
  postedAt?: string;
  authorName?: string;
  authorHandle?: string;
  likesCount?: number;
  commentsCount?: number;
  sharesCount?: number;
}

// ── Google Places ──────────────────────────────────────────────────────────

export interface GooglePlaceResult {
  placeId?: string;
  title?: string;
  url?: string;
  website?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  countryCode?: string;
  lat?: number;
  lon?: number;
  totalScore?: number;
  reviewsCount?: number;
  categoryName?: string;
  categories?: string[];
  description?: string;
  openingHours?: unknown;
  reviews?: GooglePlaceReview[];
}

export interface GooglePlaceReview {
  name?: string;
  text?: string;
  stars?: number;
  publishedAtDate?: string;
}

// ── Listing platforms ──────────────────────────────────────────────────────

export interface OpenTableListing {
  restaurantId?: string;
  name?: string;
  url?: string;
  city?: string;
  neighborhood?: string;
  cuisine?: string;
  phone?: string;
  website?: string;
}

export interface UberEatsListing {
  uuid?: string;
  title?: string;
  url?: string;
  city?: string;
  address?: string;
  categories?: string[];
  website?: string;
}

export interface JustEatListing {
  id?: string;
  name?: string;
  url?: string;
  address?: string;
  city?: string;
  cuisines?: Array<{ name: string }>;
  website?: string;
}

export type ListingPlatform = 'opentable' | 'ubereats' | 'justeat';

export type ListingResult = OpenTableListing | UberEatsListing | JustEatListing;

export interface LinkedInProfileResult {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  headline?: string;
  email?: string;
  linkedinUrl?: string;
  profilePicture?: string;
  jobTitle?: string;
  companyName?: string;
  companyWebsite?: string;
  companyLinkedinUrl?: string;
  companySize?: string;
  location?: string;
  connections?: number;
  followers?: number;
  experience?: Array<{
    title?: string;
    company?: string;
    startDate?: string;
    endDate?: string;
    current?: boolean;
  }>;
  education?: Array<{
    school?: string;
    degree?: string;
    fieldOfStudy?: string;
  }>;
  skills?: string[];
}
