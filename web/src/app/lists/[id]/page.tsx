'use client';

import { use, useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useList, useListMembers, useRefreshList, useUpdateListSchedule, useFunnelStats, useRunCompanySignals, useBuildList, useBuildStatus, useBuildContacts, useRunPersonaSignals, useApplyMarketSignals, useMemberSignals, useDeleteList, listKeys } from '@/lib/hooks/use-lists';
import { usePersonasV2 } from '@/lib/hooks/use-personas-v2';
import { useAppStore } from '@/lib/store';
import { useTriggerExport } from '@/lib/hooks/use-exports';
import { DataTable } from '@/components/shared/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { formatRelativeTime, formatNumber } from '@/lib/utils';
import { ArrowLeft, RefreshCw, Download, Clock, Zap, ChevronRight, Play, Users, UserCircle, Radar, ExternalLink, ChevronDown, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorBanner } from '@/components/shared/error-banner';
import type { ColumnDef } from '@tanstack/react-table';
import type { ListMember, PipelineStage, CompanySignal, SignalStrengthTier } from '@/lib/types';

// --- Helper components ---

function ScoreBadge({ value, thresholds }: { value: string | null | undefined; thresholds?: { green: number; amber: number } }) {
  if (!value) return <span className="text-muted-foreground">-</span>;
  const num = parseFloat(value);
  const pct = (num * 100).toFixed(0);
  const t = thresholds ?? { green: 0.6, amber: 0.3 };
  const color = num >= t.green ? 'bg-green-100 text-green-800' : num >= t.amber ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600';
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{pct}%</span>;
}

const STAGE_CONFIG: Record<string, { label: string; color: string; description: string }> = {
  tam: { label: 'TAM', color: 'bg-gray-100 text-gray-700 border-gray-300', description: 'Total Addressable Market — all ICP-fit companies' },
  active_segment: { label: 'Active', color: 'bg-blue-100 text-blue-700 border-blue-300', description: 'Promoted by market signals — showing buying intent' },
  qualified: { label: 'Qualified', color: 'bg-green-100 text-green-700 border-green-300', description: 'Passed company-level signal detection' },
  ready_to_approach: { label: 'Ready', color: 'bg-purple-100 text-purple-700 border-purple-300', description: 'Buyer committee mapped — ready for outreach' },
  in_sequence: { label: 'In Sequence', color: 'bg-orange-100 text-orange-700 border-orange-300', description: 'Currently in outreach sequence' },
  converted: { label: 'Converted', color: 'bg-emerald-100 text-emerald-700 border-emerald-300', description: 'Successfully converted' },
};

function StageBadge({ stage }: { stage: PipelineStage | null | undefined }) {
  if (!stage) return <span className="text-muted-foreground">-</span>;
  const config = STAGE_CONFIG[stage] ?? { label: stage, color: 'bg-gray-100 text-gray-600', description: '' };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}

// --- Signal tier helpers ---

function getSignalTier(signalCount: number): SignalStrengthTier {
  if (signalCount >= 3) return 'strong';
  if (signalCount >= 2) return 'medium';
  return 'weak';
}

const TIER_CONFIG: Record<SignalStrengthTier, { label: string; className: string }> = {
  weak: { label: 'Weak', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  medium: { label: 'Medium', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  strong: { label: 'Strong', className: 'bg-green-50 text-green-700 border-green-200' },
};

const PESTLE_COLORS: Record<string, string> = {
  Political: 'bg-red-50 text-red-700',
  Economic: 'bg-blue-50 text-blue-700',
  Social: 'bg-purple-50 text-purple-700',
  Technological: 'bg-cyan-50 text-cyan-700',
  Legal: 'bg-orange-50 text-orange-700',
  Environmental: 'bg-green-50 text-green-700',
};

function SignalTierBadge({ count }: { count: number }) {
  if (count === 0) return <span className="text-muted-foreground text-xs">-</span>;
  const tier = getSignalTier(count);
  const config = TIER_CONFIG[tier];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${config.className}`}>
      {config.label}
      <span className="text-[10px] opacity-70">({count})</span>
    </span>
  );
}

const SIGNAL_TYPE_LABELS: Record<string, { label: string; className: string }> = {
  market_signal: { label: 'Market Signal', className: 'bg-indigo-50 text-indigo-700' },
  expansion: { label: 'Expansion', className: 'bg-emerald-50 text-emerald-700' },
  pain_point_detected: { label: 'Pain Point', className: 'bg-red-50 text-red-700' },
  competitive_displacement: { label: 'Competitive', className: 'bg-orange-50 text-orange-700' },
  new_product_launch: { label: 'New Product', className: 'bg-cyan-50 text-cyan-700' },
  growth_momentum: { label: 'Growth', className: 'bg-green-50 text-green-700' },
  recent_funding: { label: 'Funding', className: 'bg-yellow-50 text-yellow-700' },
  tech_adoption: { label: 'Tech Adoption', className: 'bg-blue-50 text-blue-700' },
  hiring_surge: { label: 'Hiring', className: 'bg-purple-50 text-purple-700' },
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  rule_based: 'Rule-based',
  llm_analysis: 'AI Analysis',
  'enrichment provider': 'Enrichment Data',
  'funding data': 'Funding Data',
  'company website': 'Company Website',
};

function SignalDetailPanel({ signals, websiteProfile, companyDomain }: { signals: CompanySignal[]; websiteProfile?: string | null; companyDomain?: string | null }) {
  const [showProfile, setShowProfile] = useState(false);

  if (signals.length === 0 && !websiteProfile) return (
    <div className="px-6 py-4 text-sm text-muted-foreground">No signals applied to this company.</div>
  );

  const marketSignals = signals.filter(s => s.signalType === 'market_signal');
  const companySignals = signals.filter(s => s.signalType !== 'market_signal');

  return (
    <div className="px-6 py-4 space-y-4">
      {/* Market signals section */}
      {marketSignals.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Market Signals ({marketSignals.length})
          </div>
          {marketSignals.map((signal) => {
            const details = signal.signalData?.details;
            const ms = signal.marketSignal;
            const dimension = details?.pestleDimension;
            const confidence = details?.confidence;
            const dimColor = dimension ? PESTLE_COLORS[dimension] ?? 'bg-gray-50 text-gray-700' : '';

            return (
              <div key={signal.id} className="rounded-lg border bg-background p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {ms?.sourceUrl ? (
                        <a
                          href={ms.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {ms.headline || details?.signalHeadline || 'Market Signal'}
                          <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        </a>
                      ) : (
                        <span className="text-sm font-medium">{ms?.headline || details?.signalHeadline || 'Market Signal'}</span>
                      )}
                    </div>
                    {ms?.sourceName && (
                      <span className="text-xs text-muted-foreground">
                        via {ms.sourceName.replace('exa_news_search', 'Exa News').replace('tavily_news_search', 'Tavily News')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {dimension && (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${dimColor}`}>
                        {dimension}
                      </span>
                    )}
                    {confidence != null && (
                      <span className="text-xs text-muted-foreground">
                        {(confidence * 100).toFixed(0)}% confidence
                      </span>
                    )}
                  </div>
                </div>
                {signal.signalData?.evidence && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {signal.signalData.evidence}
                  </p>
                )}
                {ms?.signalCategory && (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                      {ms.signalCategory}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Strength: {(parseFloat(signal.signalStrength) * 100).toFixed(0)}%
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Company signals section */}
      {companySignals.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Company Signals ({companySignals.length})
            </div>
            {companyDomain && (
              <a
                href={`https://${companyDomain}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[10px] text-blue-600 hover:underline flex items-center gap-1"
              >
                Verify on {companyDomain} <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
          {companySignals.map((signal) => {
            const typeConfig = SIGNAL_TYPE_LABELS[signal.signalType] ?? { label: signal.signalType, className: 'bg-gray-50 text-gray-700' };
            const sourceLabel = SOURCE_TYPE_LABELS[signal.source] ?? signal.source;
            const strength = parseFloat(signal.signalStrength);

            return (
              <div key={signal.id} className="rounded-lg border bg-background p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${typeConfig.className}`}>
                      {typeConfig.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      via {sourceLabel}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    Strength: {(strength * 100).toFixed(0)}%
                  </span>
                </div>
                {signal.signalData?.evidence && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {signal.signalData.evidence}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Source data: PESTLE profile */}
      {websiteProfile && (
        <div className="space-y-2">
          <button
            onClick={(e) => { e.stopPropagation(); setShowProfile(!showProfile); }}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${showProfile ? '' : '-rotate-90'}`} />
            AI-Generated Profile (background context)
          </button>
          {showProfile && (
            <div className="rounded-lg border bg-muted/20 p-4">
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">
                {websiteProfile}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Company list column definitions ---

const SOURCE_LABELS: Record<string, { label: string; className: string }> = {
  apollo: { label: 'Apollo', className: 'bg-blue-50 text-blue-700' },
  exa: { label: 'Exa', className: 'bg-purple-50 text-purple-700' },
  leadmagic: { label: 'LeadMagic', className: 'bg-teal-50 text-teal-700' },
  ai_discovery: { label: 'AI', className: 'bg-amber-50 text-amber-700' },
};

const companyBaseColumns: ColumnDef<ListMember>[] = [
  {
    id: 'name',
    header: 'Company',
    accessorFn: (row) => row.company?.name ?? row.companyName ?? '',
    cell: ({ row }) => row.original.company?.name ?? row.original.companyName ?? '-',
  },
  {
    id: 'domain',
    header: 'Domain',
    accessorFn: (row) => row.company?.domain ?? row.companyDomain ?? '',
    cell: ({ row }) => row.original.company?.domain ?? row.original.companyDomain ?? '-',
  },
  {
    id: 'industry',
    header: 'Industry',
    accessorFn: (row) => row.companyIndustry ?? '',
    cell: ({ row }) => row.original.companyIndustry ?? '-',
  },
  {
    id: 'source',
    header: 'Source',
    accessorFn: (row) => row.companySource ?? '',
    cell: ({ row }) => {
      const source = row.original.companySource;
      if (!source) return <span className="text-muted-foreground text-xs">-</span>;
      const config = SOURCE_LABELS[source] ?? { label: source, className: 'bg-gray-50 text-gray-600' };
      return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}>
          {config.label}
        </span>
      );
    },
  },
];

const icpColumn: ColumnDef<ListMember> = {
  id: 'icpFitScore',
  header: 'ICP Fit',
  accessorFn: (row) => parseFloat(row.icpFitScore ?? '0'),
  cell: ({ row }) => <ScoreBadge value={row.original.icpFitScore} thresholds={{ green: 0.7, amber: 0.4 }} />,
};

const stageColumn: ColumnDef<ListMember> = {
  id: 'pipelineStage',
  header: 'Stage',
  accessorFn: (row) => row.pipelineStage ?? '',
  cell: ({ row }) => <StageBadge stage={row.original.pipelineStage} />,
};

function getSignalColumns(signalsByCompany?: Map<string, CompanySignal[]>): ColumnDef<ListMember>[] {
  return [
    {
      id: 'signalScore',
      header: 'Signals',
      accessorFn: (row) => {
        if (signalsByCompany) {
          return signalsByCompany.get(row.companyId ?? '')?.length ?? 0;
        }
        return parseFloat(row.signalScore ?? '0');
      },
      cell: ({ row }) => {
        if (signalsByCompany) {
          const count = signalsByCompany.get(row.original.companyId ?? '')?.length ?? 0;
          return (
            <div className="flex items-center gap-1">
              <SignalTierBadge count={count} />
              {count > 0 && <ChevronDown className="h-3 w-3 text-muted-foreground" />}
            </div>
          );
        }
        return <ScoreBadge value={row.original.signalScore} />;
      },
    },
    {
      id: 'intelligenceScore',
      header: () => (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger className="flex items-center gap-1 underline decoration-dotted decoration-muted-foreground underline-offset-4">
              Score
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p>Composite score: ICP Fit (35%) + Signals (30%) + Originality (20%) + Cost Efficiency (15%). Populated after signal detection runs.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ),
      accessorFn: (row) => parseFloat(row.intelligenceScore ?? '0'),
      cell: ({ row }) => <ScoreBadge value={row.original.intelligenceScore} />,
    },
  ];
}

const reasonColumn: ColumnDef<ListMember> = {
  id: 'reason',
  header: 'Reason',
  accessorFn: (row) => row.addedReason ?? '',
  cell: ({ row }) => {
    const reason = row.original.addedReason;
    if (!reason) return '-';
    const short = reason.length > 60 ? reason.slice(0, 60) + '...' : reason;
    return <span className="text-xs text-muted-foreground" title={reason}>{short}</span>;
  },
};

const addedColumn: ColumnDef<ListMember> = {
  id: 'addedAt',
  header: 'Added',
  accessorFn: (row) => row.addedAt,
  cell: ({ row }) => formatRelativeTime(row.original.addedAt),
};

function getColumnsForStage(stage: PipelineStage | 'all', signalsByCompany?: Map<string, CompanySignal[]>): ColumnDef<ListMember>[] {
  const signalCols = getSignalColumns(signalsByCompany);
  switch (stage) {
    case 'all':
      return [...companyBaseColumns, icpColumn, stageColumn, ...signalCols, reasonColumn, addedColumn];
    case 'tam':
      return [...companyBaseColumns, icpColumn, reasonColumn, addedColumn];
    case 'active_segment':
      return [...companyBaseColumns, icpColumn, ...signalCols, reasonColumn, addedColumn];
    case 'qualified':
    case 'ready_to_approach':
    case 'in_sequence':
    case 'converted':
      return [...companyBaseColumns, icpColumn, ...signalCols, reasonColumn, addedColumn];
    default:
      return [...companyBaseColumns, icpColumn, stageColumn, addedColumn];
  }
}

// --- Contact list column definitions ---

function getContactColumns(): ColumnDef<ListMember>[] {
  return [
    {
      id: 'contactName',
      header: 'Name',
      accessorFn: (row) => {
        if (row.contact) return `${row.contact.firstName ?? ''} ${row.contact.lastName ?? ''}`.trim() || row.contactName || '';
        return row.contactName ?? '';
      },
      cell: ({ row }) => {
        if (row.original.contact) {
          return `${row.original.contact.firstName ?? ''} ${row.original.contact.lastName ?? ''}`.trim() || row.original.contactName || '-';
        }
        return row.original.contactName ?? '-';
      },
    },
    {
      id: 'title',
      header: 'Title',
      accessorFn: (row) => row.contact?.title ?? row.contactTitle ?? '',
      cell: ({ row }) => row.original.contact?.title ?? row.original.contactTitle ?? '-',
    },
    {
      id: 'company',
      header: 'Company',
      accessorFn: (row) => row.company?.name ?? row.companyName ?? '',
      cell: ({ row }) => row.original.company?.name ?? row.original.companyName ?? '-',
    },
    {
      id: 'email',
      header: 'Email',
      accessorFn: (row) => row.contact?.workEmail ?? row.contactEmail ?? '',
      cell: ({ row }) => row.original.contact?.workEmail ?? row.original.contactEmail ?? '-',
    },
    {
      id: 'personaScore',
      header: 'Persona Score',
      accessorFn: (row) => parseFloat(row.personaScore ?? '0'),
      cell: ({ row }) => <ScoreBadge value={row.original.personaScore} thresholds={{ green: 0.6, amber: 0.3 }} />,
    },
    reasonColumn,
    addedColumn,
  ];
}

// --- Funnel bar component ---

function FunnelBar({
  stages,
  total,
  selectedStage,
  onSelectStage,
}: {
  stages: Record<string, number>;
  total: number;
  selectedStage: PipelineStage | 'all';
  onSelectStage: (stage: PipelineStage | 'all') => void;
}) {
  const stageOrder: (PipelineStage | 'all')[] = ['all', 'tam', 'active_segment', 'qualified', 'ready_to_approach'];

  const visibleStages = stageOrder.filter(
    s => s === 'all' || s === 'tam' || s === 'active_segment' || s === 'qualified' || (stages[s] ?? 0) > 0,
  );

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {visibleStages.map((stage, i) => {
          const count = stage === 'all' ? total : (stages[stage] ?? 0);
          const config = stage === 'all'
            ? { label: 'All', color: 'bg-slate-100 text-slate-700 border-slate-300', description: 'All list members across all stages' }
            : STAGE_CONFIG[stage] ?? { label: stage, color: 'bg-gray-100 text-gray-600 border-gray-200', description: '' };
          const isSelected = selectedStage === stage;
          const pct = total > 0 && stage !== 'all' ? ((count / total) * 100).toFixed(0) : null;

          return (
            <div key={stage} className="flex items-center">
              {i > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground mx-1 flex-shrink-0" />}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onSelectStage(stage)}
                    className={`
                      flex flex-col items-center rounded-lg border px-4 py-2 transition-all min-w-[90px]
                      ${isSelected ? `${config.color} border-2 shadow-sm` : 'bg-background border-border hover:bg-muted'}
                    `}
                  >
                    <span className="text-xs font-medium">{config.label}</span>
                    <span className="text-lg font-bold">{formatNumber(count)}</span>
                    {pct !== null && <span className="text-[10px] text-muted-foreground">{pct}%</span>}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{config.description}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

// --- Main page ---

export default function ListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const { selectedClientId } = useAppStore();
  const { data: list, isLoading, isError, refetch } = useList(id);
  const { data: funnel } = useFunnelStats(id);
  const refreshList = useRefreshList();
  const triggerExport = useTriggerExport();
  const updateSchedule = useUpdateListSchedule();
  const runCompanySignals = useRunCompanySignals();
  const buildList = useBuildList();
  const buildContacts = useBuildContacts();
  const runPersonaSignals = useRunPersonaSignals();
  const applyMarketSignals = useApplyMarketSignals();
  const { data: memberSignals } = useMemberSignals(id, selectedClientId);
  const deleteList = useDeleteList();

  const isContactList = list?.type === 'contact';
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Personas for "Find Buying Committee" dialog
  const { data: personas } = usePersonasV2(selectedClientId);

  // Default to the furthest stage that has companies, so the user sees where the funnel is at
  const [selectedStage, setSelectedStage] = useState<PipelineStage | 'all'>('all');
  const [stageInitialised, setStageInitialised] = useState(false);
  useEffect(() => {
    if (!funnel || stageInitialised) return;
    const stageOrder: PipelineStage[] = ['ready_to_approach', 'qualified', 'active_segment', 'tam'];
    const furthest = stageOrder.find(s => (funnel.stages[s] ?? 0) > 0);
    if (furthest) {
      setSelectedStage(furthest);
    }
    setStageInitialised(true);
  }, [funnel, stageInitialised]);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [refreshEnabled, setRefreshEnabled] = useState(false);
  const [refreshCron, setRefreshCron] = useState('');
  const [buildingJobId, setBuildingJobId] = useState<string | null>(null);
  const { data: buildJob } = useBuildStatus(buildingJobId ? id : null);

  // Find Buying Committee dialog state
  const [buyingCommitteeOpen, setBuyingCommitteeOpen] = useState(false);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('');
  const [contactListName, setContactListName] = useState('');
  const [applyingSignals, setApplyingSignals] = useState(false);

  // Poll build/job status and show toast on completion
  useEffect(() => {
    if (!buildingJobId || !buildJob) return;
    if (buildJob.status === 'completed') {
      const output = buildJob.output as Record<string, unknown>;

      // Company signals job
      if ('qualified' in output) {
        const { processed, qualified: q, signalsDetected } = output as { processed: number; qualified: number; signalsDetected: number };
        toast.success(`Signal detection complete: ${processed} evaluated, ${q} qualified, ${signalsDetected} signals detected`);
        setStageInitialised(false); // re-auto-select furthest stage
      }
      // Build job
      else {
        const { companiesAdded, companiesDiscovered, warnings } = output as { companiesAdded?: number; companiesDiscovered?: number; warnings?: string[] };
        if ((warnings as string[])?.length) {
          for (const warning of warnings!) {
            toast.warning(warning, { duration: 10000 });
          }
        }
        if ((companiesAdded ?? 0) === 0 && (companiesDiscovered ?? 0) === 0) {
          toast.error('Build completed but found 0 companies. Check your credit balance and ICP filters.');
        } else {
          toast.success(`Build complete: ${companiesDiscovered ?? 0} discovered, ${companiesAdded ?? 0} added to list`);
        }
      }

      setBuildingJobId(null);
      qc.invalidateQueries({ queryKey: listKeys.detail(id) });
      qc.invalidateQueries({ queryKey: listKeys.members(id) });
      qc.invalidateQueries({ queryKey: listKeys.funnel(id) });
    } else if (buildJob.status === 'failed') {
      toast.error('Job failed. Check job logs for details.');
      setBuildingJobId(null);
    }
  }, [buildJob?.status, buildingJobId, id, qc]);

  // Fetch members filtered by stage (company lists only)
  const memberParams = useMemo(() => ({
    limit: 100,
    stage: !isContactList && selectedStage !== 'all' ? selectedStage : undefined,
  }), [selectedStage, isContactList]);
  const { data: members } = useListMembers(id, memberParams);

  // Group company signals by companyId for the tier badge and sub-row
  const signalsByCompany = useMemo(() => {
    if (!memberSignals?.length) return undefined;
    const map = new Map<string, CompanySignal[]>();
    for (const signal of memberSignals) {
      const existing = map.get(signal.companyId) ?? [];
      existing.push(signal);
      map.set(signal.companyId, existing);
    }
    return map;
  }, [memberSignals]);

  const columns = useMemo(
    () => isContactList ? getContactColumns() : getColumnsForStage(selectedStage, signalsByCompany),
    [selectedStage, isContactList, signalsByCompany],
  );

  const renderSignalSubRow = useMemo(() => {
    if (!signalsByCompany) return undefined;
    return (row: ListMember) => {
      const signals = signalsByCompany.get(row.companyId ?? '') ?? [];
      const domain = row.company?.domain ?? row.companyDomain ?? null;
      return <SignalDetailPanel signals={signals} websiteProfile={row.companyWebsiteProfile} companyDomain={domain} />;
    };
  }, [signalsByCompany]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-12">Loading...</div>;
  }

  if (isError || !list) {
    return <ErrorBanner title="List not found" description="Could not load list data. The API may be unavailable." retry={() => refetch()} />;
  }

  const handleRefresh = async () => {
    try {
      await refreshList.mutateAsync(id);
      toast.success('Refresh started');
    } catch {
      toast.error('Failed to refresh');
    }
  };

  const handleBuild = async () => {
    try {
      const { jobId } = await buildList.mutateAsync(id);
      setBuildingJobId(jobId);
      toast.success('Building list — discovering companies from providers...');
    } catch {
      toast.error('Failed to start build');
    }
  };

  const isBuildingList = buildList.isPending || !!buildingJobId;
  const hasMembers = (funnel?.total ?? list.memberCount) > 0;
  const canBuild = !!list.icpId;

  const handleExport = async () => {
    if (!selectedClientId) return;
    try {
      await triggerExport.mutateAsync({
        clientId: selectedClientId,
        listId: id,
        format: 'csv',
      });
      toast.success('Export started');
    } catch {
      toast.error('Failed to export');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteList.mutateAsync(id);
      toast.success(`"${list.name}" deleted`);
      router.push('/lists');
    } catch {
      toast.error('Failed to delete list');
    }
  };

  const handleRunCompanySignals = async () => {
    try {
      const result = await runCompanySignals.mutateAsync(id);
      toast.success('Company signal detection started — this may take a minute...');
      if (result?.jobId) {
        setBuildingJobId(result.jobId);
        setSelectedStage('all');
      }
    } catch {
      toast.error('Failed to start signal detection');
    }
  };

  const handleRunPersonaSignals = async () => {
    try {
      await runPersonaSignals.mutateAsync(id);
      toast.success('Persona signal detection started');
    } catch {
      toast.error('Failed to start persona signal detection');
    }
  };

  const handleApplyMarketSignals = async () => {
    try {
      setApplyingSignals(true);
      await applyMarketSignals.mutateAsync(id);
      toast.success('Applying market signals — enriching profiles, searching for evidence, and classifying...');
    } catch {
      toast.error('Failed to apply market signals');
      setApplyingSignals(false);
    }
  };

  const handleBuildContacts = async () => {
    if (!selectedPersonaId) return;
    try {
      const result = await buildContacts.mutateAsync({
        id,
        data: {
          personaId: selectedPersonaId,
          name: contactListName || undefined,
        },
      });
      setBuyingCommitteeOpen(false);
      setSelectedPersonaId('');
      setContactListName('');
      toast.success('Building contact list — searching for matching contacts...');
      router.push(`/lists/${result.contactListId}`);
    } catch {
      toast.error('Failed to start contact list build');
    }
  };

  const openBuyingCommitteeDialog = () => {
    setContactListName(`${list.name} — Contacts`);
    setBuyingCommitteeOpen(true);
  };

  const handleSaveSchedule = async () => {
    try {
      await updateSchedule.mutateAsync({
        id,
        data: {
          refreshEnabled,
          refreshCron: refreshEnabled ? refreshCron : undefined,
        },
      });
      setScheduleOpen(false);
      toast.success('Schedule updated');
    } catch {
      toast.error('Failed to update schedule');
    }
  };

  const openScheduleDialog = () => {
    setRefreshEnabled(list.refreshEnabled);
    setRefreshCron(list.refreshCron || '0 9 * * 1');
    setScheduleOpen(true);
  };

  const activeCount = funnel?.stages?.active_segment ?? 0;
  const qualifiedCount = funnel?.stages?.qualified ?? 0;

  // --- Contact List View ---
  if (isContactList) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/lists">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{list.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300">
                <UserCircle className="mr-1 h-3 w-3" />
                Contact List
              </Badge>
              {list.sourceCompanyListId && (
                <Link href={`/lists/${list.sourceCompanyListId}`}>
                  <Badge variant="secondary" className="cursor-pointer hover:bg-secondary/80">
                    View Source List
                  </Badge>
                </Link>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleRunPersonaSignals}
              disabled={runPersonaSignals.isPending || !hasMembers}
            >
              <Zap className="mr-2 h-4 w-4" />
              {runPersonaSignals.isPending ? 'Running...' : 'Run Persona Signals'}
            </Button>
            {hasMembers && (
              <Button variant="outline" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            )}
            <Button variant="outline" onClick={() => setDeleteOpen(true)} className="text-destructive hover:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatNumber(list.memberCount)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Persona</CardTitle>
            </CardHeader>
            <CardContent>
              {list.personaId ? (
                <Link href={`/personas/${list.personaId}`} className="text-sm font-medium text-primary hover:underline">
                  View Persona
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground">No persona assigned</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Created</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-medium">{formatRelativeTime(list.createdAt)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Empty state */}
        {!hasMembers && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No contacts yet</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                Contacts are being discovered from qualified companies. Check the Jobs page for progress.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Contacts Table */}
        {hasMembers && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Contacts</h2>
            </div>
            <DataTable columns={columns} data={members ?? []} />
          </div>
        )}
      </div>
    );
  }

  // --- Company List View ---
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/lists">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{list.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline">{list.type}</Badge>
            {list.refreshEnabled && <Badge variant="secondary">Auto-refresh</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          {canBuild && (
            <Button
              onClick={handleBuild}
              disabled={isBuildingList}
              variant={hasMembers ? 'outline' : 'default'}
            >
              <Play className="mr-2 h-4 w-4" />
              {isBuildingList ? 'Building...' : hasMembers ? 'Rebuild' : 'Build List'}
            </Button>
          )}
          {hasMembers && (
            <>
              <Button
                onClick={handleApplyMarketSignals}
                disabled={applyMarketSignals.isPending || applyingSignals}
                variant="default"
              >
                <Radar className="mr-2 h-4 w-4" />
                {applyMarketSignals.isPending || applyingSignals ? 'Applying...' : 'Apply Market Signals'}
              </Button>
              <Button variant="outline" onClick={openScheduleDialog}>
                <Clock className="mr-2 h-4 w-4" />
                Schedule
              </Button>
              <Button variant="outline" onClick={handleRefresh} disabled={refreshList.isPending}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
              <Button variant="outline" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </>
          )}
          <Button variant="outline" onClick={() => setDeleteOpen(true)} className="text-destructive hover:text-destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Empty state — no members yet */}
      {!hasMembers && !isBuildingList && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Play className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No companies yet</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
              {canBuild
                ? 'Build this list to discover companies matching your ICP from external providers. This will populate your TAM — the first stage of the funnel.'
                : 'Assign an ICP to this list first, then build it to discover matching companies.'}
            </p>
            {canBuild && (
              <Button onClick={handleBuild} size="lg">
                <Play className="mr-2 h-5 w-5" />
                Build List
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Building indicator */}
      {isBuildingList && (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 py-8">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Discovering companies from providers and scoring against your ICP...</p>
          </CardContent>
        </Card>
      )}

      {/* Funnel Bar — only show when we have members */}
      {hasMembers && funnel && (
        <FunnelBar
          stages={funnel.stages}
          total={funnel.total}
          selectedStage={selectedStage}
          onSelectStage={setSelectedStage}
        />
      )}

      {/* Summary Cards — only show when we have members */}
      {hasMembers && <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total TAM</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatNumber(funnel?.stages?.tam ?? list.memberCount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active (Market Signals)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatNumber(activeCount)}</p>
            <p className="text-xs text-muted-foreground">Showing buying intent</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Qualified (Company Signals)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatNumber(qualifiedCount)}</p>
            <p className="text-xs text-muted-foreground">Passed signal detection</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Last Refreshed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-medium">{formatRelativeTime(list.lastRefreshedAt)}</p>
          </CardContent>
        </Card>
      </div>}

      {/* Members Table with Stage Actions */}
      {hasMembers &&
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {selectedStage === 'all' ? 'All Members' : `${STAGE_CONFIG[selectedStage]?.label ?? selectedStage} Members`}
          </h2>
          <div className="flex gap-2">
            {selectedStage === 'tam' && (funnel?.stages?.tam ?? 0) > 0 && (
              <Button
                onClick={handleApplyMarketSignals}
                disabled={applyMarketSignals.isPending || applyingSignals}
                size="sm"
              >
                <Radar className="mr-2 h-4 w-4" />
                {applyMarketSignals.isPending || applyingSignals ? 'Applying...' : 'Apply Market Signals'}
              </Button>
            )}
            {selectedStage === 'active_segment' && activeCount > 0 && (
              <Button
                onClick={handleRunCompanySignals}
                disabled={runCompanySignals.isPending}
                size="sm"
              >
                <Zap className="mr-2 h-4 w-4" />
                {runCompanySignals.isPending ? 'Running...' : 'Run Company Signals'}
              </Button>
            )}
            {selectedStage === 'qualified' && qualifiedCount > 0 && (
              <>
                <Button
                  variant="outline"
                  onClick={handleRunCompanySignals}
                  disabled={runCompanySignals.isPending}
                  size="sm"
                >
                  <Zap className="mr-2 h-4 w-4" />
                  {runCompanySignals.isPending ? 'Re-evaluating...' : 'Re-run Signals'}
                </Button>
                <Button onClick={openBuyingCommitteeDialog} size="sm">
                  <Users className="mr-2 h-4 w-4" />
                  Find Buying Committee
                </Button>
                <Button variant="outline" onClick={handleExport} size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  Export Qualified
                </Button>
              </>
            )}
          </div>
        </div>
        <DataTable
          columns={columns}
          data={members ?? []}
          renderSubRow={renderSignalSubRow}
          getRowId={(row) => row.companyId ?? row.id}
        />
      </div>}

      {/* Find Buying Committee Dialog */}
      <Dialog open={buyingCommitteeOpen} onOpenChange={setBuyingCommitteeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Find Buying Committee</DialogTitle>
            <DialogDescription>
              Search for contacts at {qualifiedCount} qualified companies matching a persona.
              This creates a new contact list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Persona</Label>
              <Select value={selectedPersonaId} onValueChange={setSelectedPersonaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a persona..." />
                </SelectTrigger>
                <SelectContent>
                  {personas?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(!personas || personas.length === 0) && (
                <p className="text-xs text-muted-foreground">
                  No personas found.{' '}
                  <Link href="/personas" className="text-primary hover:underline">Create one first</Link>.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Contact List Name</Label>
              <Input
                value={contactListName}
                onChange={(e) => setContactListName(e.target.value)}
                placeholder="e.g. VP Engineering — Q1 List"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBuyingCommitteeOpen(false)}>Cancel</Button>
              <Button
                onClick={handleBuildContacts}
                disabled={!selectedPersonaId || buildContacts.isPending}
              >
                {buildContacts.isPending ? 'Building...' : 'Build Contact List'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete list</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-medium text-foreground">{list.name}</span>?
              {list.type === 'company' && ' Any child contact lists will also be removed.'}
              {' '}This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteList.isPending}>
              {deleteList.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Schedule Dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Refresh Schedule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Auto-refresh</Label>
              <Switch checked={refreshEnabled} onCheckedChange={setRefreshEnabled} />
            </div>
            {refreshEnabled && (
              <div className="space-y-2">
                <Label>Cron Expression</Label>
                <Input
                  value={refreshCron}
                  onChange={(e) => setRefreshCron(e.target.value)}
                  placeholder="0 9 * * 1"
                />
                <p className="text-xs text-muted-foreground">
                  Format: minute hour day month weekday. Example: &quot;0 9 * * 1&quot; = Every Monday at 9am
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setScheduleOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveSchedule} disabled={updateSchedule.isPending}>
                {updateSchedule.isPending ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
