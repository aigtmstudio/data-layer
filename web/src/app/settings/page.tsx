'use client';

import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckCircle2, XCircle, Loader2, RotateCcw, Save } from 'lucide-react';
import { usePromptConfigs, useUpdatePromptConfig, useResetPromptConfig, useDataSources } from '@/lib/hooks/use-prompt-configs';
import type { PromptConfig } from '@/lib/types';

function PromptEditor({ prompt }: { prompt: PromptConfig }) {
  const [content, setContent] = useState(prompt.currentContent);
  const [isDirty, setIsDirty] = useState(false);
  const updateMutation = useUpdatePromptConfig();
  const resetMutation = useResetPromptConfig();

  // Sync when prompt data changes from server
  useEffect(() => {
    setContent(prompt.currentContent);
    setIsDirty(false);
  }, [prompt.currentContent]);

  const handleChange = (value: string) => {
    setContent(value);
    setIsDirty(value !== prompt.currentContent);
  };

  const handleConfirm = () => {
    updateMutation.mutate(
      { key: prompt.key, content },
      { onSuccess: () => setIsDirty(false) },
    );
  };

  const handleReset = () => {
    resetMutation.mutate(prompt.key, {
      onSuccess: (data) => {
        setContent(data.currentContent);
        setIsDirty(false);
      },
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{prompt.label}</CardTitle>
              <Badge variant="outline" className="text-xs">
                {prompt.promptType}
              </Badge>
              <Badge variant="secondary" className="text-xs font-mono">
                {prompt.model}
              </Badge>
              {prompt.isCustomised && (
                <Badge className="bg-amber-600 text-xs">Customised</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{prompt.description}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={content}
          onChange={(e) => handleChange(e.target.value)}
          className="min-h-[200px] font-mono text-xs leading-relaxed"
          placeholder="Prompt content..."
        />
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {prompt.updatedAt
              ? `Last updated: ${new Date(prompt.updatedAt).toLocaleString()}`
              : 'Using default prompt'}
          </div>
          <div className="flex items-center gap-2">
            {prompt.isCustomised && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={resetMutation.isPending}
              >
                {resetMutation.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                )}
                Reset to Default
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={!isDirty || updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              Confirm
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const [health, setHealth] = useState<{ status: string; timestamp: string } | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [healthLoading, setHealthLoading] = useState(true);

  const { data: prompts, isLoading: promptsLoading } = usePromptConfigs();
  const { data: dataSources } = useDataSources();

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    fetch(`${apiUrl}/health`)
      .then((res) => res.json())
      .then((data) => {
        setHealth(data);
        setHealthLoading(false);
      })
      .catch(() => {
        setHealthError(true);
        setHealthLoading(false);
      });
  }, []);

  // Group prompts by area
  const promptsByArea = useMemo(() => {
    if (!prompts) return {};
    const grouped: Record<string, PromptConfig[]> = {};
    for (const prompt of prompts) {
      if (!grouped[prompt.area]) grouped[prompt.area] = [];
      grouped[prompt.area].push(prompt);
    }
    return grouped;
  }, [prompts]);

  const areas = Object.keys(promptsByArea);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">System configuration, prompts, and status</p>
      </div>

      {/* API Connection */}
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
            {healthLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : healthError ? (
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

      {/* Prompt Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>AI Prompts</CardTitle>
          <p className="text-sm text-muted-foreground">
            Edit the system and user prompts used across the platform. Changes take effect immediately.
          </p>
        </CardHeader>
        <CardContent>
          {promptsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : areas.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No prompts configured.</p>
          ) : (
            <Tabs defaultValue={areas[0]} className="w-full">
              <TabsList className="mb-4 flex-wrap h-auto gap-1">
                {areas.map((area) => (
                  <TabsTrigger key={area} value={area} className="text-xs">
                    {area}
                    <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">
                      {promptsByArea[area].length}
                    </Badge>
                  </TabsTrigger>
                ))}
              </TabsList>
              {areas.map((area) => (
                <TabsContent key={area} value={area} className="space-y-4">
                  {promptsByArea[area].map((prompt) => (
                    <PromptEditor key={prompt.key} prompt={prompt} />
                  ))}
                </TabsContent>
              ))}
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Data Sources */}
      <Card>
        <CardHeader>
          <CardTitle>Data Sources</CardTitle>
          <p className="text-sm text-muted-foreground">
            All external providers and integrations. Optional sources activate when an API key is configured.
          </p>
        </CardHeader>
        <CardContent>
          {!dataSources ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (() => {
            const categories = Array.from(new Set(dataSources.map(s => s.category)));
            return (
              <div className="space-y-6">
                {categories.map(category => (
                  <div key={category}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{category}</p>
                    <div className="space-y-2">
                      {dataSources.filter(s => s.category === category).map(source => (
                        <div
                          key={source.name}
                          className="flex items-start justify-between rounded-md border p-3 gap-4"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-sm">{source.displayName}</p>
                              {source.required && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">Required</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{source.description}</p>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {source.capabilities.map(cap => (
                                <span key={cap} className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                                  {cap}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 pt-0.5">
                            {source.priority != null && (
                              <Badge variant="outline" className="text-xs">P{source.priority}</Badge>
                            )}
                            {source.active ? (
                              <Badge className="gap-1 bg-green-600 text-xs">
                                <CheckCircle2 className="h-3 w-3" />
                                Active
                              </Badge>
                            ) : (
                              <div className="flex flex-col items-end gap-1">
                                <Badge variant="secondary" className="gap-1 text-xs text-muted-foreground">
                                  <XCircle className="h-3 w-3" />
                                  Inactive
                                </Badge>
                                {source.envVars.map(v => (
                                  <code key={v} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono whitespace-nowrap">
                                    {v}
                                  </code>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Environment */}
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
