export const ACTORS = {
  LINKEDIN_COMPANY_SCRAPER: 'dev_fusion~linkedin-company-scraper',
  LINKEDIN_PROFILE_SCRAPER: 'dev_fusion~linkedin-profile-scraper',

  // Social monitoring
  INSTAGRAM_SCRAPER: 'apify~instagram-scraper',
  TWITTER_SCRAPER: 'apidojo~tweet-scraper',
  YOUTUBE_SCRAPER: 'streamers~youtube-scraper',
  REDDIT_SCRAPER: 'harshmaur~reddit-scraper',
  LINKEDIN_POSTS_SCRAPER: 'harvestapi~linkedin-post-search',

  // Company discovery
  GOOGLE_PLACES: 'compass~crawler-google-places',
  OPENTABLE_SCRAPER: 'dtrungtin~opentable-restaurants-scraper',
  UBEREATS_SCRAPER: 'dtrungtin~ubereats-restaurants-scraper',
  JUSTEAT_SCRAPER: 'apify~just-eat-scraper',
} as const;
