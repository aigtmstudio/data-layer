'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/lib/store';
import { useLists, useCreateList, useBuildList, useRefreshList, useBuildStatus } from '@/lib/hooks/use-lists';
import { useIcps } from '@/lib/hooks/use-icps';
import { useTriggerExport } from '@/lib/hooks/use-exports';
import { DataTable } from '@/components/shared/data-table';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDate, formatRelativeTime, formatNumber } from '@/lib/utils';
import { Plus, List, MoreHorizontal, Play, RefreshCw, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorBanner } from '@/components/shared/error-banner';
import type { ColumnDef } from '@tanstack/react-table';
import type { List as ListType } from '@/lib/types';

export default function ListsPage() {
  const qc = useQueryClient();
  const { selectedClientId } = useAppStore();
  const { data: lists, isLoading, isError, refetch } = useLists(selectedClientId ?? undefined);
  const { data: icps } = useIcps(selectedClientId);
  const createList = useCreateList();
  const buildList = useBuildList();
  const refreshList = useRefreshList();
  const triggerExport = useTriggerExport();

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcpId, setNewIcpId] = useState('');
  const [buildingListId, setBuildingListId] = useState<string | null>(null);
  const { data: buildJob } = useBuildStatus(buildingListId);

  const handleCreate = async () => {
    if (!newName.trim() || !selectedClientId || !newIcpId) return;
    try {
      await createList.mutateAsync({
        clientId: selectedClientId,
        name: newName,
        icpId: newIcpId,
        type: 'company',
      });
      setCreateOpen(false);
      setNewName('');
      setNewIcpId('');
      toast.success('List created');
    } catch {
      toast.error('Failed to create list');
    }
  };

  const handleBuild = async (id: string) => {
    try {
      await buildList.mutateAsync(id);
      setBuildingListId(id);
      toast.success('Discovering companies from providers...');
    } catch {
      toast.error('Failed to start build');
    }
  };

  // Show toast when build completes and refresh list data
  useEffect(() => {
    if (!buildingListId || !buildJob) return;
    if (buildJob.status === 'completed') {
      const output = buildJob.output as { companiesAdded?: number; contactsAdded?: number; companiesDiscovered?: number };
      toast.success(`Build complete: ${output.companiesAdded ?? 0} companies, ${output.contactsAdded ?? 0} contacts added`);
      setBuildingListId(null);
      qc.invalidateQueries({ queryKey: ['lists', selectedClientId] });
    } else if (buildJob.status === 'failed') {
      toast.error('Build failed. Check job logs for details.');
      setBuildingListId(null);
      qc.invalidateQueries({ queryKey: ['lists', selectedClientId] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- qc is stable, selectedClientId captured in closure
  }, [buildJob?.status, buildingListId]);

  const handleRefresh = async (id: string) => {
    try {
      await refreshList.mutateAsync(id);
      toast.success('List refresh started');
    } catch {
      toast.error('Failed to refresh list');
    }
  };

  const handleExport = async (listId: string) => {
    if (!selectedClientId) return;
    try {
      await triggerExport.mutateAsync({
        clientId: selectedClientId,
        listId,
        format: 'csv',
      });
      toast.success('Export started');
    } catch {
      toast.error('Failed to export');
    }
  };

  const columns: ColumnDef<ListType>[] = [
    { accessorKey: 'name', header: 'Name', cell: ({ row }) => (
      <Link href={`/lists/${row.original.id}`} className="font-medium text-primary hover:underline">
        {row.original.name}
      </Link>
    )},
    { accessorKey: 'type', header: 'Type', cell: ({ row }) => (
      <Badge variant="outline" className={row.original.type === 'contact' ? 'bg-purple-50 text-purple-700 border-purple-300' : ''}>
        {row.original.type}
      </Badge>
    )},
    { accessorKey: 'memberCount', header: 'Members', cell: ({ row }) => (
      buildingListId === row.original.id ? (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Building...
        </span>
      ) : formatNumber(row.original.memberCount)
    )},
    { accessorKey: 'refreshEnabled', header: 'Refresh', cell: ({ row }) => (
      row.original.refreshEnabled ? (
        <Badge variant="secondary">Scheduled</Badge>
      ) : (
        <span className="text-muted-foreground">Off</span>
      )
    )},
    { accessorKey: 'lastRefreshedAt', header: 'Last Refreshed', cell: ({ row }) => formatRelativeTime(row.original.lastRefreshedAt) },
    { accessorKey: 'createdAt', header: 'Created', cell: ({ row }) => formatDate(row.original.createdAt) },
    {
      id: 'actions',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => handleBuild(row.original.id)}
              disabled={buildingListId === row.original.id}
            >
              {buildingListId === row.original.id ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              {buildingListId === row.original.id ? 'Building...' : 'Build'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleRefresh(row.original.id)}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport(row.original.id)}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  if (!selectedClientId) {
    return (
      <EmptyState
        icon={List}
        title="No client selected"
        description="Select a client from the header to view lists."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Lists</h1>
          <p className="text-muted-foreground">Build and manage targeted lists</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create List
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">Loading...</div>
      ) : isError ? (
        <ErrorBanner retry={() => refetch()} />
      ) : !lists?.length ? (
        <EmptyState
          icon={List}
          title="No lists yet"
          description="Create your first list to start targeting companies and contacts."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create List
            </Button>
          }
        />
      ) : (
        <DataTable columns={columns} data={lists} />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create List</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Enterprise SaaS Targets"
              />
            </div>
            <div className="space-y-2">
              <Label>ICP</Label>
              <Select value={newIcpId} onValueChange={setNewIcpId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an ICP" />
                </SelectTrigger>
                <SelectContent>
                  {icps?.map((icp) => (
                    <SelectItem key={icp.id} value={icp.id}>
                      {icp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!newName.trim() || !newIcpId || createList.isPending}>
                {createList.isPending ? 'Creating...' : 'Create List'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
