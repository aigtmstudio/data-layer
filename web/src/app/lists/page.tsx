'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { useLists, useCreateList, useBuildList, useRefreshList } from '@/lib/hooks/use-lists';
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
import { Plus, List, MoreHorizontal, Play, RefreshCw, Download } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorBanner } from '@/components/shared/error-banner';
import type { ColumnDef } from '@tanstack/react-table';
import type { List as ListType } from '@/lib/types';

export default function ListsPage() {
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
  const [newType, setNewType] = useState<'company' | 'contact' | 'mixed'>('contact');

  const handleCreate = async () => {
    if (!newName.trim() || !selectedClientId) return;
    try {
      await createList.mutateAsync({
        clientId: selectedClientId,
        name: newName,
        icpId: newIcpId || undefined,
        type: newType,
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
      toast.success('List build started');
    } catch {
      toast.error('Failed to start build');
    }
  };

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
    { accessorKey: 'type', header: 'Type', cell: ({ row }) => <Badge variant="outline">{row.original.type}</Badge> },
    { accessorKey: 'memberCount', header: 'Members', cell: ({ row }) => formatNumber(row.original.memberCount) },
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
            <DropdownMenuItem onClick={() => handleBuild(row.original.id)}>
              <Play className="mr-2 h-4 w-4" />
              Build
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
              <Label>Type</Label>
              <Select value={newType} onValueChange={(v) => setNewType(v as typeof newType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contact">Contact</SelectItem>
                  <SelectItem value="company">Company</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>ICP (optional)</Label>
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
              <Button onClick={handleCreate} disabled={createList.isPending}>
                {createList.isPending ? 'Creating...' : 'Create List'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
