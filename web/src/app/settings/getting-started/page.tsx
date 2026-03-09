'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  Users,
  Crosshair,
  List,
  Zap,
  Radio,
  TrendingUp,
  UserCircle,
  Mail,
  Settings,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
} from 'lucide-react';

interface StepProps {
  number: number;
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  linkLabel: string;
  details: string[];
  tips?: string[];
  warnings?: string[];
  dependsOn?: string;
}

function Step({ number, title, description, icon, href, linkLabel, details, tips, warnings, dependsOn }: StepProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
              {number}
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                {icon}
                {title}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
            </div>
          </div>
          {dependsOn && (
            <Badge variant="outline" className="shrink-0 text-xs">
              Requires: {dependsOn}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2 text-sm">
          {details.map((detail, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-500" />
              <span>{detail}</span>
            </li>
          ))}
        </ul>

        {tips && tips.length > 0 && (
          <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 p-3 space-y-1">
            {tips.map((tip, i) => (
              <p key={i} className="text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
                <Lightbulb className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{tip}</span>
              </p>
            ))}
          </div>
        )}

        {warnings && warnings.length > 0 && (
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 p-3 space-y-1">
            {warnings.map((warning, i) => (
              <p key={i} className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{warning}</span>
              </p>
            ))}
          </div>
        )}

        <Link href={href}>
          <Button variant="outline" size="sm" className="mt-2">
            {linkLabel}
            <ArrowRight className="ml-2 h-3.5 w-3.5" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

const steps: StepProps[] = [
  {
    number: 1,
    title: 'Create a Client',
    description: 'Set up the company you are building pipeline for.',
    icon: <Users className="h-5 w-5" />,
    href: '/clients',
    linkLabel: 'Go to Clients',
    details: [
      'Add the company name, website domain, and industry.',
      'Describe what the client sells and who they sell to — this context is used by AI throughout the platform.',
      'Add key products/services so signal detection can match buying intent to what you actually offer.',
    ],
    tips: [
      'The more detail you provide in the client profile, the better the AI-generated outputs (signals, briefs, speaker suggestions) will be.',
    ],
  },
  {
    number: 2,
    title: 'Define an ICP',
    description: 'Create an Ideal Customer Profile to target the right companies.',
    icon: <Crosshair className="h-5 w-5" />,
    href: '/icps',
    linkLabel: 'Go to ICPs',
    dependsOn: 'Client',
    details: [
      'Set firmographic filters: industry, employee count range, geography, and revenue.',
      'The ICP is used to score every company discovered — a higher ICP fit means the company matches your target profile.',
      'You can create multiple ICPs per client for different segments (e.g. "UK SMB agencies" vs "US Enterprise tech").',
    ],
    tips: [
      'Start broad and refine later. It\'s easier to tighten filters than to miss good companies by being too narrow upfront.',
    ],
  },
  {
    number: 3,
    title: 'Build a Company List',
    description: 'Discover and import companies that match your ICP.',
    icon: <List className="h-5 w-5" />,
    href: '/lists',
    linkLabel: 'Go to Lists',
    dependsOn: 'ICP',
    details: [
      'Create a new list and select the client + ICP it should target.',
      'Click "Rebuild" to run company discovery — this searches multiple data providers to find matching companies.',
      'Each company is scored against your ICP. All discovered companies start at the "TAM" (Total Addressable Market) stage.',
    ],
    tips: [
      'Lists are the core building block. Every intelligence feature (signals, enrichment, contacts) operates on a list.',
    ],
  },
  {
    number: 4,
    title: 'Enrich Companies',
    description: 'Fetch detailed data on your TAM companies.',
    icon: <Zap className="h-5 w-5" />,
    href: '/enrichment',
    linkLabel: 'Go to Enrichment',
    dependsOn: 'List',
    details: [
      'Enrichment fills in missing data: employee count, tech stack, funding, description, and more.',
      'Deep enrichment also scrapes company websites to generate a PESTLE profile — a structured AI analysis of each company\'s environment.',
      'PESTLE profiles are essential for market signal matching (the next step), so run enrichment before applying signals.',
    ],
    warnings: [
      'Deep enrichment uses AI credits. For large lists (200+ companies), expect it to take 10-20 minutes.',
    ],
  },
  {
    number: 5,
    title: 'Generate Signal Hypotheses',
    description: 'Create the hypotheses that drive evidence-based signal detection.',
    icon: <Radio className="h-5 w-5" />,
    href: '/signals',
    linkLabel: 'Go to Signals',
    dependsOn: 'Client',
    details: [
      'Signal hypotheses define what market events you care about — e.g. "Companies affected by new data privacy regulations".',
      'The AI generates hypotheses based on your client profile, products, and target market.',
      'Hypotheses are used to search for real-world evidence (news, regulatory changes, market shifts) that match your companies.',
    ],
    warnings: [
      'You must generate hypotheses before running "Apply Market Signals" on a list. Without hypotheses, the pipeline has nothing to search for.',
    ],
  },
  {
    number: 6,
    title: 'Apply Market Signals',
    description: 'Promote TAM companies to Active based on real-world buying signals.',
    icon: <TrendingUp className="h-5 w-5" />,
    href: '/lists',
    linkLabel: 'Go to Lists',
    dependsOn: 'Hypotheses + Enrichment',
    details: [
      'From a list, click "Apply Market Signals" to run the 3-step pipeline: deep enrichment, evidence search, and signal classification.',
      'The system searches for real-world evidence matching your hypotheses, then evaluates which companies are affected.',
      'Companies with strong, relevant signals are promoted from "TAM" to "Active" — these are showing genuine buying intent.',
    ],
    tips: [
      'You can track progress in the list view while the pipeline runs. Check the Jobs page for detailed status.',
      'Use "Force Fresh" to re-run evidence search even if hypotheses were recently searched.',
    ],
  },
  {
    number: 7,
    title: 'Run Company Signals',
    description: 'Qualify Active companies with company-level intent signals.',
    icon: <Radio className="h-5 w-5" />,
    href: '/lists',
    linkLabel: 'Go to Lists',
    dependsOn: 'Active companies',
    details: [
      'Company signals detect individual-level buying triggers: hiring surges, tech adoption, expansion, funding rounds.',
      'Only companies at "Active" stage are evaluated — run market signals first to promote companies from TAM.',
      'Companies with strong signals are promoted to "Qualified" — these are your highest-priority targets.',
    ],
    tips: [
      'Strong signal = single signal with adjusted strength >= 0.85. Multiple strong = 2+ signals at >= 0.7.',
    ],
  },
  {
    number: 8,
    title: 'Build Contacts',
    description: 'Find decision-maker contacts at your qualified companies.',
    icon: <UserCircle className="h-5 w-5" />,
    href: '/lists',
    linkLabel: 'Go to Lists',
    dependsOn: 'Qualified companies',
    details: [
      'From a company list, click "Build Contacts" to find people matching your personas at qualified companies.',
      'Contact discovery uses your persona definitions to find the right job titles and seniority levels.',
      'Contacts are enriched with email, LinkedIn URL, and employment history.',
    ],
  },
  {
    number: 9,
    title: 'Generate Engagement Briefs',
    description: 'Create personalised outreach briefs for each contact.',
    icon: <Mail className="h-5 w-5" />,
    href: '/lists',
    linkLabel: 'Go to Lists',
    dependsOn: 'Contacts',
    details: [
      'Engagement briefs combine everything: company intelligence, signal data, PESTLE analysis, and contact details.',
      'Each brief provides a tailored reason to reach out, specific talking points, and a suggested approach.',
      'Use briefs to inform your outreach — they give your SDRs the context to write relevant, personalised messages.',
    ],
  },
];

export default function GettingStartedPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Getting Started</h1>
          <p className="text-muted-foreground mt-1">
            A step-by-step guide to building intelligence-driven pipeline with Curatable.
          </p>
        </div>
        <Link href="/settings">
          <Button variant="outline" size="sm">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </Link>
      </div>

      {/* Overview */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6">
          <h2 className="text-base font-semibold mb-2">How Curatable Works</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Curatable builds targeted company lists and qualifies them using real-world market intelligence.
            The pipeline follows a funnel: <strong>TAM</strong> (all discovered companies) →{' '}
            <strong>Active</strong> (showing market-level buying signals) →{' '}
            <strong>Qualified</strong> (strong company-level intent) →{' '}
            <strong>Contacts</strong> (decision-makers with personalised briefs).
            Each step narrows the funnel to surface only the companies worth reaching out to.
          </p>
        </CardContent>
      </Card>

      {/* Pipeline diagram */}
      <div className="flex items-center justify-center gap-2 flex-wrap text-sm py-2">
        {[
          { label: 'TAM', sub: 'All matches' },
          { label: 'Active', sub: 'Market signals' },
          { label: 'Qualified', sub: 'Company signals' },
          { label: 'Contacts', sub: 'Decision-makers' },
          { label: 'Briefs', sub: 'Ready to reach out' },
        ].map((stage, i) => (
          <div key={stage.label} className="flex items-center gap-2">
            {i > 0 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
            <div className="text-center px-4 py-2 rounded-md border bg-card">
              <div className="font-medium">{stage.label}</div>
              <div className="text-xs text-muted-foreground">{stage.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Steps */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Step-by-step guide</h2>
        {steps.map((step) => (
          <Step key={step.number} {...step} />
        ))}
      </div>

      {/* Tips section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            General Tips
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-500" />
              <span><strong>Check the Jobs page</strong> to monitor background tasks. All long-running operations (list building, enrichment, signal detection) create trackable jobs.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-500" />
              <span><strong>Watch your credits</strong> in the top bar. Deep enrichment, signal detection, and brief generation all consume AI credits.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-500" />
              <span><strong>Order matters.</strong> The pipeline is sequential: Client → ICP → List → Enrich → Hypotheses → Market Signals → Company Signals → Contacts → Briefs. Skipping steps will produce incomplete results.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-500" />
              <span><strong>Iterate and refine.</strong> You can re-run any step. Tighten your ICP filters, regenerate hypotheses, or re-run signals as you learn what works.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-500" />
              <span><strong>Use the Signals page</strong> to review detected market signals and understand why companies were promoted. This helps you tune your hypotheses.</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
