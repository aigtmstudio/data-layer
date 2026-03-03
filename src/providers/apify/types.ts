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
  text?: string;
  full_text?: string;
  url?: string;
  tweetUrl?: string;
  // author field variants
  author?: {
    username?: string;
    name?: string;
    followers?: number;
    followersCount?: number;
  };
  user?: {
    screen_name?: string;
    name?: string;
    followers_count?: number;
  };
  // engagement field variants
  likeCount?: number;
  favorite_count?: number;
  retweetCount?: number;
  retweet_count?: number;
  replyCount?: number;
  reply_count?: number;
  viewCount?: number;
  // date field variants
  createdAt?: string;
  created_at?: string;
}

export interface YouTubeVideo {
  // id field variants
  id?: string;
  videoId?: string;
  title?: string;
  // description field variants
  description?: string;
  text?: string;
  // url field variants
  url?: string;
  link?: string;
  // channel field variants
  channelName?: string;
  channelTitle?: string;
  author?: string;
  channelUrl?: string;
  // engagement field variants (actor sometimes returns strings)
  viewCount?: number | string;
  views?: number | string;
  likeCount?: number | string;
  likes?: number | string;
  commentCount?: number | string;
  comments?: number | string;
  // date field variants
  publishedAt?: string;
  uploadDate?: string;
  date?: string;
  duration?: string;
}

export interface RedditPost {
  id?: string;
  title?: string;
  // body field variants
  body?: string;
  text?: string;
  selftext?: string;
  // subreddit field variants
  subreddit?: string;
  communityName?: string;
  // url field variants
  url?: string;
  postUrl?: string;
  // score/upvote field variants
  score?: number;
  upvotes?: number;
  // comment count field variants
  numberOfComments?: number;
  numComments?: number;
  commentsCount?: number;
  // date field variants
  createdAt?: string;
  createdUtc?: number;
  created_utc?: number;
  // author field variants
  author?: string;
  username?: string;
}

// harvestapi/linkedin-post-search output schema
export interface LinkedInPost {
  type?: string;
  id?: string;
  linkedinUrl?: string;
  content?: string;
  author?: {
    universalName?: string;
    name?: string;
    linkedinUrl?: string;
    info?: string; // headline/title
  };
  postedAt?: {
    timestamp?: number;
    date?: string;
    postedAgoText?: string;
  };
  engagement?: {
    likes?: number;
    comments?: number;
    shares?: number;
  };
  query?: {
    search?: string;
  };
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
