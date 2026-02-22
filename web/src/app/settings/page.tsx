'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export default function SettingsPage() {
  const [health, setHealth] = useState<{ status: string; timestamp: string } | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    fetch(`${apiUrl}/health`)
      .then((res) => res.json())
      .then((data) => {
        setHealth(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">System configuration and status</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>API Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Backend API</p>
              <p className="text-xs text-muted-foreground">
                {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}
              </p>
            </div>
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : error ? (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="h-3.5 w-3.5" />
                Disconnected
              </Badge>
            ) : (
              <Badge variant="default" className="gap-1 bg-green-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Connected
              </Badge>
            )}
          </div>

          {health && (
            <div className="rounded-md bg-muted p-3">
              <p className="text-xs text-muted-foreground">
                Status: {health.status} | Timestamp: {health.timestamp}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Sources</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { name: 'Apollo', type: 'Contact & Company Data', priority: 1 },
              { name: 'LeadMagic', type: 'Contact & Company Enrichment', priority: 2 },
              { name: 'Prospeo', type: 'Email Finding & Verification', priority: 3 },
            ].map((source) => (
              <div
                key={source.name}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div>
                  <p className="font-medium">{source.name}</p>
                  <p className="text-xs text-muted-foreground">{source.type}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">Priority {source.priority}</Badge>
                  <Badge variant="secondary">Active</Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Environment</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">API URL</span>
              <code className="rounded bg-muted px-2 py-0.5 text-xs">
                {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}
              </code>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">API Key</span>
              <code className="rounded bg-muted px-2 py-0.5 text-xs">
                {process.env.NEXT_PUBLIC_API_KEY ? '••••••••' : 'Not set'}
              </code>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
