'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useClient, useUpdateClient, useDeleteClient } from '@/lib/hooks/use-clients';
import { useIcps, useCreateIcp } from '@/lib/hooks/use-icps';
import { useCreditBalance, useCreditHistory, useAddCredits } from '@/lib/hooks/use-credits';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { DataTable } from '@/components/shared/data-table';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ArrowLeft, Plus, Sparkles, TrendingUp, DollarSign, Receipt, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorBanner } from '@/components/shared/error-banner';
import type { ColumnDef } from '@tanstack/react-table';
import type { CreditTransaction, Icp } from '@/lib/types';
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

const icpColumns: ColumnDef<Icp>[] = [
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

  const [addCreditsOpen, setAddCreditsOpen] = useState(false);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditDescription, setCreditDescription] = useState('');
  const [newIcpOpen, setNewIcpOpen] = useState(false);
  const [newIcpName, setNewIcpName] = useState('');
  const [newIcpNl, setNewIcpNl] = useState('');

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
            columns={icpColumns}
            data={icps ?? []}
            onRowClick={(icp) => {
              window.location.href = `/icps/${icp.id}?clientId=${id}`;
            }}
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
