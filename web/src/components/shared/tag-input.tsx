'use client';

import { useState, type KeyboardEvent, type ClipboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

export function TagInput({ value, onChange, placeholder = 'Type and press Enter (comma-separated ok)' }: TagInputProps) {
  const [input, setInput] = useState('');

  const addTags = (raw: string) => {
    const newTags = raw
      .split(/[,\n]+/)
      .map((t) => t.trim())
      .filter((t) => t && !value.includes(t));
    if (newTags.length > 0) {
      onChange([...value, ...newTags]);
    }
    setInput('');
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (input.trim()) {
        e.preventDefault();
        addTags(input);
      }
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted.includes(',') || pasted.includes('\n')) {
      e.preventDefault();
      addTags(pasted);
    }
  };

  const handleBlur = () => {
    if (input.trim()) {
      addTags(input);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-background p-2">
      {value.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1">
          {tag}
          <button type="button" onClick={() => removeTag(tag)} className="ml-1 hover:text-destructive">
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={handleBlur}
        placeholder={value.length === 0 ? placeholder : ''}
        className="h-7 min-w-[120px] flex-1 border-0 p-0 shadow-none focus-visible:ring-0"
      />
    </div>
  );
}
