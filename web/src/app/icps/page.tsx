'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store';
import { useIcps, useCreateIcp } from '@/lib/hooks/use-icps';
import { DataTable } from '@/components/shared/data-table';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDate } from '@/lib/utils';
import { Plus, Crosshair } from 'lucide-react';
import { toast } from 'sonner';
import { ErrorBanner } from '@/components/shared/error-banner';
import type { ColumnDef } from '@tanstack/react-table';
import type { Icp } from '@/lib/types';

export default function IcpsPage() {
  const { selectedClientId } = useAppStore();
  const { data: icps, isLoading, isError } = useIcps(selectedClientId);
  const createIcp = useCreateIcp();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  if (!selectedClientId) {
    return (
      <EmptyState
        icon={Crosshair}
        title="No client selected"
        description="Select a client from the header to view ICPs."
      />
    );
  }

  if (isError) {
    return <ErrorBanner description="Failed to load ICPs." />;
  }

  const columns: ColumnDef<Icp>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <Link href={`/icps/${row.original.id}`} className="font-medium text-primary hover:underline">
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm truncate max-w-[300px] block">
          {row.original.description || '-'}
        </span>
      ),
    },
    {
      id: 'filters',
      header: 'Filters',
      cell: ({ row }) => {
        const f = row.original.filters;
        const count =
          (f.industries?.length ?? 0) +
          (f.countries?.length ?? 0) +
          (f.techStack?.length ?? 0) +
          (f.keywords?.length ?? 0);
        return count > 0 ? <Badge variant="secondary">{count} filters</Badge> : <span className="text-muted-foreground">-</span>;
      },
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }) =>
        row.original.isActive ? (
          <Badge variant="default">Active</Badge>
        ) : (
          <Badge variant="secondary">Inactive</Badge>
        ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
  ];

  const handleCreate = async () => {
    if (!newName.trim() || !selectedClientId) return;
    try {
      await createIcp.mutateAsync({
        clientId: selectedClientId,
        data: { name: newName.trim(), description: newDescription.trim() || undefined },
      });
      setDialogOpen(false);
      setNewName('');
      setNewDescription('');
      toast.success('ICP created');
    } catch {
      toast.error('Failed to create ICP');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Ideal Customer Profiles</h1>
          <p className="text-muted-foreground">Define your target company characteristics</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create ICP
        </Button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading...</div>
      ) : !icps?.length ? (
        <EmptyState
          icon={Crosshair}
          title="No ICPs yet"
          description="Create an Ideal Customer Profile to start building targeted lists."
          action={
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create ICP
            </Button>
          }
        />
      ) : (
        <DataTable columns={columns} data={icps} />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create ICP</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Mid-Market SaaS Companies"
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Brief description of this ICP"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!newName.trim() || createIcp.isPending}>
                {createIcp.isPending ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
