import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { logger } from './logger.js';

export interface ExtractedDocument {
  text: string;
  metadata: {
    pages?: number;
    format: string;
    sizeBytes: number;
  };
}

const SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
]);

const MAX_TEXT_LENGTH = 100_000; // 100K chars max to send to LLM

export class DocumentExtractor {
  async extract(buffer: Buffer, mimeType: string): Promise<ExtractedDocument> {
    if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
      throw new Error(`Unsupported file type: ${mimeType}`);
    }

    logger.info({ mimeType, sizeBytes: buffer.length }, 'Extracting document text');

    switch (mimeType) {
      case 'application/pdf':
        return this.extractPdf(buffer);
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return this.extractDocx(buffer);
      case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
        return this.extractPptx(buffer);
      case 'text/plain':
      case 'text/csv':
        return this.extractPlainText(buffer, mimeType);
      default:
        throw new Error(`Unsupported file type: ${mimeType}`);
    }
  }

  private async extractPdf(buffer: Buffer): Promise<ExtractedDocument> {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const textResult = await parser.getText();
    const pages = textResult.total;
    await parser.destroy();
    return {
      text: truncateText(textResult.text),
      metadata: {
        pages,
        format: 'pdf',
        sizeBytes: buffer.length,
      },
    };
  }

  private async extractDocx(buffer: Buffer): Promise<ExtractedDocument> {
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: truncateText(result.value),
      metadata: {
        format: 'docx',
        sizeBytes: buffer.length,
      },
    };
  }

  private async extractPptx(buffer: Buffer): Promise<ExtractedDocument> {
    // PPTX files are ZIP archives containing XML slide files.
    // We use dynamic import for jszip (available as transitive dep via exceljs).
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buffer);

    const slideTexts: string[] = [];
    const slideFiles = Object.keys(zip.files)
      .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)/)?.[1] ?? '0');
        const numB = parseInt(b.match(/slide(\d+)/)?.[1] ?? '0');
        return numA - numB;
      });

    for (const fileName of slideFiles) {
      const xml = await zip.files[fileName].async('text');
      // Extract text content from XML by stripping tags
      const textContent = xml
        .replace(/<a:t[^>]*>(.*?)<\/a:t>/g, '$1 ')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (textContent) {
        slideTexts.push(textContent);
      }
    }

    return {
      text: truncateText(slideTexts.join('\n\n')),
      metadata: {
        pages: slideFiles.length,
        format: 'pptx',
        sizeBytes: buffer.length,
      },
    };
  }

  private extractPlainText(buffer: Buffer, mimeType: string): ExtractedDocument {
    return {
      text: truncateText(buffer.toString('utf-8')),
      metadata: {
        format: mimeType === 'text/csv' ? 'csv' : 'text',
        sizeBytes: buffer.length,
      },
    };
  }
}

function truncateText(text: string): string {
  if (text.length <= MAX_TEXT_LENGTH) return text;
  return text.slice(0, MAX_TEXT_LENGTH) + '\n\n[...truncated]';
}
