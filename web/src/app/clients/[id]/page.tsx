'use client';

import { use, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useClient, useUpdateClient, useDeleteClient } from '@/lib/hooks/use-clients';
import { useIcps, useCreateIcp, useDeleteIcp } from '@/lib/hooks/use-icps';
import { useCreditBalance, useCreditHistory, useAddCredits } from '@/lib/hooks/use-credits';
import { useHypotheses, useGenerateHypotheses, useCreateHypothesis, useUpdateHypothesis, useDeleteHypothesis } from '@/lib/hooks/use-hypotheses';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataTable } from '@/components/shared/data-table';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ArrowLeft, Plus, Sparkles, TrendingUp, DollarSign, Receipt, Trash2, Lightbulb, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorBanner } from '@/components/shared/error-banner';
import type { ColumnDef } from '@tanstack/react-table';
import type { CreditTransaction, Icp, SignalHypothesis } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const creditColumns: ColumnDef<CreditTransaction>[] = [
  { accessorKey: 'type', header: 'Type', cell: ({ row }) => <Badge variant="outline">{row.original.type}</Badge> },
  { accessorKey: 'description', header: 'Description', cell: ({ row }) => (
    <span className="line-clamp-1 max-w-[200px]">{row.original.description}</span>
  )},
  { accessorKey: 'baseCost', header: 'Base Cost', cell: ({ row }) => row.original.baseCost ? formatCurrency(row.original.baseCost) : '-' },
  { accessorKey: 'marginAmount', header: 'Margin', cell: ({ row }) => row.original.marginAmount ? formatCurrency(row.original.marginAmount) : '-' },
  { accessorKey: 'amount', header: 'Total Charged', cell: ({ row }) => formatCurrency(row.original.amount) },
  { accessorKey: 'dataSource', header: 'Source', cell: ({ row }) => row.original.dataSource ? <Badge variant="secondary" className="text-xs">{row.original.dataSource}</Badge> : '-' },
  { accessorKey: 'balanceAfter', header: 'Balance', cell: ({ row }) => formatCurrency(row.original.balanceAfter) },
  { accessorKey: 'createdAt', header: 'Date', cell: ({ row }) => formatDate(row.original.createdAt) },
];

const baseIcpColumns: ColumnDef<Icp>[] = [
  { accessorKey: 'name', header: 'Name' },
  {
    accessorKey: 'naturalLanguageInput',
    header: 'Description',
    cell: ({ row }) => (
      <span className="line-clamp-1 max-w-xs text-sm text-muted-foreground">
        {row.original.naturalLanguageInput || '-'}
      </span>
    ),
  },
  {
    accessorKey: 'aiParsingConfidence',
    header: 'Confidence',
    cell: ({ row }) => (row.original.aiParsingConfidence ? `${(parseFloat(row.original.aiParsingConfidence) * 100).toFixed(0)}%` : '-'),
  },
  {
    accessorKey: 'isActive',
    header: 'Status',
    cell: ({ row }) => <Badge variant={row.original.isActive ? 'default' : 'secondary'}>{row.original.isActive ? 'Active' : 'Inactive'}</Badge>,
  },
];

const categoryColors: Record<string, string> = {
  regulatory: 'bg-red-100 text-red-700',
  economic: 'bg-blue-100 text-blue-700',
  technology: 'bg-purple-100 text-purple-700',
  competitive: 'bg-orange-100 text-orange-700',
};

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  retired: 'bg-gray-100 text-gray-500',
};

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: client, isLoading, isError, refetch } = useClient(id);
  const router = useRouter();
  const updateClient = useUpdateClient();
  const deleteClient = useDeleteClient();
  const { data: icps } = useIcps(id);
  const { data: balance } = useCreditBalance(id);
  const { data: history } = useCreditHistory(id);
  const addCredits = useAddCredits();
  const createIcp = useCreateIcp();
  const deleteIcp = useDeleteIcp();
  const [awaitingGeneration, setAwaitingGeneration] = useState(false);
  const prevCountRef = useRef<number | undefined>(undefined);
  const { data: hypotheses } = useHypotheses(id, undefined, {
    refetchInterval: awaitingGeneration ? 3000 : false,
  });
  const generateHypotheses = useGenerateHypotheses();
  const createHypothesis = useCreateHypothesis();
  const updateHypothesis = useUpdateHypothesis();
  const deleteHypothesisAction = useDeleteHypothesis();

  // Stop polling when new hypotheses appear after generation
  useEffect(() => {
    if (!awaitingGeneration) return;
    const count = hypotheses?.length ?? 0;
    if (prevCountRef.current !== undefined && count > prevCountRef.current) {
      setAwaitingGeneration(false);
      toast.success(`${count - prevCountRef.current} hypotheses generated`);
    }
    prevCountRef.current = count;
  }, [hypotheses, awaitingGeneration]);

  const [addCreditsOpen, setAddCreditsOpen] = useState(false);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditDescription, setCreditDescription] = useState('');
  const [newIcpOpen, setNewIcpOpen] = useState(false);
  const [newIcpName, setNewIcpName] = useState('');
  const [newIcpNl, setNewIcpNl] = useState('');
  const [newHypothesisOpen, setNewHypothesisOpen] = useState(false);
  const [newHypothesisText, setNewHypothesisText] = useState('');
  const [newHypothesisCategory, setNewHypothesisCategory] = useState<string>('competitive');
  const [newHypothesisDetection, setNewHypothesisDetection] = useState('news_search');
  const [newHypothesisSegments, setNewHypothesisSegments] = useState('');
  const [newHypothesisPriority, setNewHypothesisPriority] = useState('5');

  if (isLoading) {
    return <div className="flex items-center justify-center py-12">Loading...</div>;
  }

  if (isError || !client) {
    return <ErrorBanner title="Client not found" description="Could not load client data. The API may be unavailable." retry={() => refetch()} />;
  }

  const handleToggleActive = async () => {
    try {
      await updateClient.mutateAsync({ id, data: { isActive: !client.isActive } });
      toast.success(client.isActive ? 'Client deactivated' : 'Client activated');
    } catch {
      toast.error('Failed to update client');
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${client.name}"? This cannot be undone.`)) return;
    try {
      await deleteClient.mutateAsync(id);
      toast.success('Client deleted');
      router.push('/clients');
    } catch {
      toast.error('Failed to delete client');
    }
  };

  const handleAddCredits = async () => {
    const amount = parseFloat(creditAmount);
    if (isNaN(amount) || amount <= 0) return;
    try {
      await addCredits.mutateAsync({
        clientId: id,
        data: { amount, description: creditDescription || 'Manual credit addition' },
      });
      setAddCreditsOpen(false);
      setCreditAmount('');
      setCreditDescription('');
      toast.success('Credits added');
    } catch {
      toast.error('Failed to add credits');
    }
  };

  const handleDeleteIcp = async (icpId: string, icpName: string) => {
    if (!confirm(`Delete ICP "${icpName}"? This cannot be undone.`)) return;
    try {
      await deleteIcp.mutateAsync({ clientId: id, icpId });
      toast.success('ICP deleted');
    } catch {
      toast.error('Failed to delete ICP');
    }
  };

  const handleCreateIcp = async () => {
    if (!newIcpName.trim()) return;
    try {
      await createIcp.mutateAsync({
        clientId: id,
        data: {
          name: newIcpName,
          naturalLanguageInput: newIcpNl || undefined,
        },
      });
      setNewIcpOpen(false);
      setNewIcpName('');
      setNewIcpNl('');
      toast.success('ICP created');
    } catch {
      toast.error('Failed to create ICP');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/clients">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{client.name}</h1>
          <p className="text-sm text-muted-foreground">{client.slug} {client.industry && `· ${client.industry}`}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="active-toggle" className="text-sm">Active</Label>
            <Switch
              id="active-toggle"
              checked={client.isActive}
              onCheckedChange={handleToggleActive}
            />
          </div>
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleteClient.isPending}>
            <Trash2 className="mr-1 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="icps">ICPs</TabsTrigger>
          <TabsTrigger value="hypotheses">Signal Hypotheses</TabsTrigger>
          <TabsTrigger value="credits">Credits</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Credit Balance</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{balance ? formatCurrency(balance.balance) : formatCurrency(client.creditBalance)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Margin Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{client.creditMarginPercent}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">ICPs</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{icps?.length ?? 0}</p>
              </CardContent>
            </Card>
          </div>

          {/* Profitability Summary */}
          {(() => {
            const usageTxns = (history ?? []).filter((t) => t.type === 'usage');
            const totalBaseCost = usageTxns.reduce((sum, t) => sum + (t.baseCost ? parseFloat(t.baseCost) : 0), 0);
            const totalMargin = usageTxns.reduce((sum, t) => sum + (t.marginAmount ? parseFloat(t.marginAmount) : 0), 0);
            const totalCharged = usageTxns.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);
            const effectiveMargin = totalCharged > 0 ? (totalMargin / totalCharged) * 100 : 0;

            return (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="h-4 w-4" />
                    Profitability
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-4">
                    <div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Receipt className="h-3.5 w-3.5" />
                        Raw Cost
                      </div>
                      <p className="mt-1 text-xl font-bold">{formatCurrency(totalBaseCost)}</p>
                      <p className="text-xs text-muted-foreground">What you pay providers</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <TrendingUp className="h-3.5 w-3.5" />
                        Margin Earned
                      </div>
                      <p className="mt-1 text-xl font-bold text-green-600">{formatCurrency(totalMargin)}</p>
                      <p className="text-xs text-muted-foreground">Your markup</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <DollarSign className="h-3.5 w-3.5" />
                        Total Billed
                      </div>
                      <p className="mt-1 text-xl font-bold">{formatCurrency(totalCharged)}</p>
                      <p className="text-xs text-muted-foreground">Client was charged</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <TrendingUp className="h-3.5 w-3.5" />
                        Effective Margin
                      </div>
                      <p className="mt-1 text-xl font-bold">{effectiveMargin.toFixed(1)}%</p>
                      <p className="text-xs text-muted-foreground">Across {usageTxns.length} operations</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {client.website && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Website</p>
                <a href={client.website} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                  {client.website}
                </a>
              </CardContent>
            </Card>
          )}

          {client.notes && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Notes</p>
                <p className="text-sm">{client.notes}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="icps" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setNewIcpOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add ICP
            </Button>
          </div>
          <DataTable
            columns={[
              ...baseIcpColumns,
              {
                id: 'actions',
                header: '',
                cell: ({ row }) => (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteIcp(row.original.id, row.original.name);
                    }}
                    disabled={deleteIcp.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ),
              },
            ]}
            data={icps ?? []}
            onRowClick={(icp) => {
              window.location.href = `/icps/${icp.id}`;
            }}
          />
        </TabsContent>

        <TabsContent value="hypotheses" className="space-y-4">
          {/* Context warning */}
          {(() => {
            const hasIndustry = !!client.industry;
            const hasNotes = !!client.notes;
            const hasIcps = (icps ?? []).length > 0;
            const hasIcpDetail = (icps ?? []).some(icp =>
              icp.naturalLanguageInput || (icp.filters?.industries?.length ?? 0) > 0
            );
            const contextScore = [hasIndustry, hasNotes, hasIcps, hasIcpDetail].filter(Boolean).length;

            if (contextScore < 2) {
              return (
                <Card className="border-amber-200 bg-amber-50">
                  <CardContent className="flex items-start gap-3 pt-4 pb-4">
                    <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">Limited context for hypothesis generation</p>
                      <p className="text-sm text-amber-700 mt-1">
                        AI-generated hypotheses work best with rich client data. Consider adding:
                        {!hasIndustry && ' industry,'}
                        {!hasNotes && ' notes (about what the client sells and their target market),'}
                        {!hasIcps && ' at least one ICP,'}
                        {hasIcps && !hasIcpDetail && ' more detail to your ICP (description, industries, keywords),'}
                        {' '}or add hypotheses manually below.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            }
            return null;
          })()}

          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Testable hypotheses about what market signals indicate buying urgency.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setNewHypothesisOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Manually
              </Button>
              <Button
                onClick={async () => {
                  try {
                    prevCountRef.current = hypotheses?.length ?? 0;
                    await generateHypotheses.mutateAsync({ clientId: id, signalLevel: 'market' });
                    setAwaitingGeneration(true);
                    toast.success('Hypothesis generation started — results will appear shortly');
                  } catch {
                    toast.error('Failed to start hypothesis generation');
                  }
                }}
                disabled={generateHypotheses.isPending || awaitingGeneration}
              >
                <Lightbulb className="mr-2 h-4 w-4" />
                {generateHypotheses.isPending ? 'Starting...' : awaitingGeneration ? 'Generating...' : 'Generate with AI'}
              </Button>
            </div>
          </div>
          <DataTable
            columns={[
              {
                accessorKey: 'hypothesis',
                header: 'Hypothesis',
                cell: ({ row }: { row: { original: SignalHypothesis } }) => (
                  <span className="text-sm" title={row.original.hypothesis}>{row.original.hypothesis}</span>
                ),
              },
              {
                accessorKey: 'signalCategory',
                header: 'Category',
                cell: ({ row }: { row: { original: SignalHypothesis } }) => (
                  <Badge variant="outline" className={categoryColors[row.original.signalCategory] ?? ''}>
                    {row.original.signalCategory}
                  </Badge>
                ),
              },
              {
                accessorKey: 'priority',
                header: 'Priority',
                cell: ({ row }: { row: { original: SignalHypothesis } }) => (
                  <span className="font-mono text-sm">{row.original.priority}</span>
                ),
              },
              {
                accessorKey: 'status',
                header: 'Status',
                cell: ({ row }: { row: { original: SignalHypothesis } }) => (
                  <Badge variant="outline" className={statusColors[row.original.status] ?? ''}>
                    {row.original.status}
                  </Badge>
                ),
              },
              {
                accessorKey: 'monitoringSources',
                header: 'Detection',
                cell: ({ row }: { row: { original: SignalHypothesis } }) => {
                  const method = row.original.monitoringSources?.[0] ?? '';
                  const labels: Record<string, string> = {
                    funding_data: 'Funding',
                    hiring_activity: 'Hiring',
                    tech_stack_monitoring: 'Tech Stack',
                    news_search: 'News',
                    website_content_analysis: 'Website',
                    description_analysis: 'Description',
                    webhook_external_feed: 'Webhook',
                  };
                  return (
                    <Badge variant="secondary" className="text-xs">
                      {labels[method] ?? method.replace(/_/g, ' ')}
                    </Badge>
                  );
                },
              },
              {
                id: 'actions',
                header: '',
                cell: ({ row }: { row: { original: SignalHypothesis } }) => (
                  <div className="flex gap-1">
                    {row.original.status === 'active' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateHypothesis.mutate({ id: row.original.id, data: { status: 'paused' } });
                        }}
                      >
                        Pause
                      </Button>
                    )}
                    {row.original.status === 'paused' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateHypothesis.mutate({ id: row.original.id, data: { status: 'active' } });
                        }}
                      >
                        Activate
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteHypothesisAction.mutate(row.original.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ),
              },
            ] satisfies ColumnDef<SignalHypothesis>[]}
            data={hypotheses ?? []}
          />
        </TabsContent>

        <TabsContent value="credits" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Current Balance</p>
              <p className="text-2xl font-bold">{balance ? formatCurrency(balance.balance) : '-'}</p>
            </div>
            <Button onClick={() => setAddCreditsOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Credits
            </Button>
          </div>
          <DataTable columns={creditColumns} data={history ?? []} />
        </TabsContent>
      </Tabs>

      {/* Add Credits Dialog */}
      <Dialog open={addCreditsOpen} onOpenChange={setAddCreditsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Credits</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                placeholder="100.00"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={creditDescription}
                onChange={(e) => setCreditDescription(e.target.value)}
                placeholder="Monthly credit top-up"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAddCreditsOpen(false)}>Cancel</Button>
              <Button onClick={handleAddCredits} disabled={addCredits.isPending}>
                {addCredits.isPending ? 'Adding...' : 'Add Credits'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Hypothesis Dialog */}
      <Dialog open={newHypothesisOpen} onOpenChange={setNewHypothesisOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              <Lightbulb className="mr-2 inline h-4 w-4" />
              Add Hypothesis
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Hypothesis</Label>
              <Textarea
                value={newHypothesisText}
                onChange={(e) => setNewHypothesisText(e.target.value)}
                placeholder="Companies undergoing digital transformation in financial services are likely evaluating new compliance solutions..."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={newHypothesisCategory} onValueChange={setNewHypothesisCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="regulatory">Regulatory</SelectItem>
                    <SelectItem value="economic">Economic</SelectItem>
                    <SelectItem value="industry">Industry</SelectItem>
                    <SelectItem value="competitive">Competitive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority (1-10)</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={newHypothesisPriority}
                  onChange={(e) => setNewHypothesisPriority(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Detection Method</Label>
              <Select value={newHypothesisDetection} onValueChange={setNewHypothesisDetection}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="funding_data">Funding Data</SelectItem>
                  <SelectItem value="hiring_activity">Hiring Activity</SelectItem>
                  <SelectItem value="tech_stack_monitoring">Tech Stack Monitoring</SelectItem>
                  <SelectItem value="news_search">News Search</SelectItem>
                  <SelectItem value="website_content_analysis">Website Content Analysis</SelectItem>
                  <SelectItem value="description_analysis">Description Analysis</SelectItem>
                  <SelectItem value="webhook_external_feed">Webhook / External Feed</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">How the system will detect this signal.</p>
            </div>
            <div className="space-y-2">
              <Label>Affected Segments</Label>
              <Input
                value={newHypothesisSegments}
                onChange={(e) => setNewHypothesisSegments(e.target.value)}
                placeholder="enterprise fintech, mid-market banking"
              />
              <p className="text-xs text-muted-foreground">Comma-separated list of ICP segments this hypothesis impacts.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setNewHypothesisOpen(false)}>Cancel</Button>
              <Button
                onClick={async () => {
                  if (!newHypothesisText.trim()) return;
                  try {
                    await createHypothesis.mutateAsync({
                      clientId: id,
                      hypothesis: newHypothesisText.trim(),
                      signalLevel: 'market',
                      signalCategory: newHypothesisCategory,
                      monitoringSources: [newHypothesisDetection],
                      affectedSegments: newHypothesisSegments ? newHypothesisSegments.split(',').map(s => s.trim()).filter(Boolean) : undefined,
                      priority: parseInt(newHypothesisPriority, 10) || 5,
                    });
                    setNewHypothesisOpen(false);
                    setNewHypothesisText('');
                    setNewHypothesisCategory('competitive');
                    setNewHypothesisDetection('news_search');
                    setNewHypothesisSegments('');
                    setNewHypothesisPriority('5');
                    toast.success('Hypothesis created');
                  } catch {
                    toast.error('Failed to create hypothesis');
                  }
                }}
                disabled={createHypothesis.isPending || !newHypothesisText.trim()}
              >
                {createHypothesis.isPending ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New ICP Dialog */}
      <Dialog open={newIcpOpen} onOpenChange={setNewIcpOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              <Sparkles className="mr-2 inline h-4 w-4" />
              New ICP
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={newIcpName}
                onChange={(e) => setNewIcpName(e.target.value)}
                placeholder="Enterprise SaaS ICP"
              />
            </div>
            <div className="space-y-2">
              <Label>Natural Language Description</Label>
              <Textarea
                value={newIcpNl}
                onChange={(e) => setNewIcpNl(e.target.value)}
                placeholder="Mid-market B2B SaaS companies with 50-500 employees in the US, using modern tech stacks, Series A to C funded..."
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                AI will parse this into structured filters after creation.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setNewIcpOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateIcp} disabled={createIcp.isPending}>
                {createIcp.isPending ? 'Creating...' : 'Create ICP'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
