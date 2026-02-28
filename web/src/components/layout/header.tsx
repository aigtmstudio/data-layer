'use client';

import { useAppStore } from '@/lib/store';
import { useClients } from '@/lib/hooks/use-clients';
import { useCreditBalance } from '@/lib/hooks/use-credits';
import { formatCurrency } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Wallet } from 'lucide-react';

export function Header() {
  const { selectedClientId, setSelectedClientId } = useAppStore();
  const { data: clients, isError: clientsError } = useClients();
  const { data: balance } = useCreditBalance(selectedClientId);

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-4 md:px-6">
      <div className="flex items-center gap-4">
        {clientsError ? (
          <Badge variant="outline" className="text-muted-foreground">
            API unavailable
          </Badge>
        ) : (
          <Select
            value={selectedClientId ?? ''}
            onValueChange={(val) => setSelectedClientId(val || null)}
          >
            <SelectTrigger className="w-[180px] md:w-[220px]">
              <SelectValue placeholder="Select a client" />
            </SelectTrigger>
            <SelectContent>
              {clients?.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex items-center gap-3">
        {selectedClientId && balance && (
          <Badge variant="secondary" className="gap-1.5 px-3 py-1 text-sm">
            <Wallet className="h-3.5 w-3.5" />
            {formatCurrency(balance.balance)}
          </Badge>
        )}
      </div>
    </header>
  );
}
