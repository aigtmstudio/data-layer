'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useClients, useCreateClient } from '@/lib/hooks/use-clients';
import { useAppStore } from '@/lib/store';
import { ClientForm } from '@/components/clients/client-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { formatCurrency } from '@/lib/utils';
import { Plus, Users, Building2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ClientsPage() {
  const [formOpen, setFormOpen] = useState(false);
  const { data: clients, isLoading } = useClients();
  const createClient = useCreateClient();
  const { setSelectedClientId } = useAppStore();

  const handleCreate = async (data: Parameters<typeof createClient.mutateAsync>[0]) => {
    try {
      const client = await createClient.mutateAsync(data);
      setSelectedClientId(client.id);
      setFormOpen(false);
      toast.success('Client created');
    } catch {
      toast.error('Failed to create client');
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-12">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="text-muted-foreground">Manage your client accounts</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Client
        </Button>
      </div>

      {!clients?.length ? (
        <EmptyState
          icon={Users}
          title="No clients yet"
          description="Add your first client to get started with enrichment and list building."
          action={
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Client
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <Link key={client.id} href={`/clients/${client.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-base font-medium">{client.name}</CardTitle>
                  <Badge variant={client.isActive ? 'default' : 'secondary'}>
                    {client.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {client.industry && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5" />
                        {client.industry}
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Credits</span>
                      <span className="font-medium">{formatCurrency(client.creditBalance)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Margin</span>
                      <span className="text-sm">{client.creditMarginPercent}%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <ClientForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleCreate}
        loading={createClient.isPending}
      />
    </div>
  );
}
