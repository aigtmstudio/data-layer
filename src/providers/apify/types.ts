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
