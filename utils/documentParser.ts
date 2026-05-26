import JSZip from 'jszip';

export interface ParsedChatFile {
  name: string;
  mimeType: string;
  size: number;
  extension: string;
  text: string;
  truncated: boolean;
}

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_CHARS = 60000;

const normalizeText = (text: string) => text
  .replace(/\r\n/g, '\n')
  .replace(/\r/g, '\n')
  .replace(/\u0000/g, '')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{4,}/g, '\n\n\n')
  .trim();

const limitText = (text: string) => {
  const normalized = normalizeText(text);
  if (normalized.length <= MAX_TEXT_CHARS) return { text: normalized, truncated: false };
  return {
    text: `${normalized.slice(0, MAX_TEXT_CHARS)}\n\n[文件内容过长，已截断前 ${MAX_TEXT_CHARS} 字符]`,
    truncated: true,
  };
};

const getExtension = (name: string) => {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || '';
};

const decodeXmlEntities = (value: string) => value
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'");

const stripDocxXml = (xml: string) => decodeXmlEntities(
  xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, ''),
);

const parseDocx = async (file: File) => {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const doc = await zip.file('word/document.xml')?.async('string');
  if (!doc) throw new Error('这个 Word 文件里没有找到正文内容');
  const footnotes = await zip.file('word/footnotes.xml')?.async('string').catch(() => '');
  const endnotes = await zip.file('word/endnotes.xml')?.async('string').catch(() => '');
  return [stripDocxXml(doc), footnotes ? stripDocxXml(footnotes) : '', endnotes ? stripDocxXml(endnotes) : '']
    .filter(Boolean)
    .join('\n\n');
};

const decodePdfLiteral = (raw: string) => raw
  .replace(/\\n/g, '\n')
  .replace(/\\r/g, '\n')
  .replace(/\\t/g, '\t')
  .replace(/\\\(/g, '(')
  .replace(/\\\)/g, ')')
  .replace(/\\\\/g, '\\');

const decodePdfHex = (raw: string) => {
  const clean = raw.replace(/\s+/g, '');
  if (!clean || clean.length % 2 !== 0) return '';
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    const b = parseInt(clean.slice(i, i + 2), 16);
    if (!Number.isNaN(b)) bytes.push(b);
  }
  if (!bytes.length) return '';
  const arr = new Uint8Array(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(arr.slice(2));
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(arr.slice(2));
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(arr);
};

const parsePdfBestEffort = async (file: File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const raw = new TextDecoder('latin1').decode(bytes);
  const parts: string[] = [];
  const literalRe = /\((?:\\.|[^\\)]){1,2000}\)\s*Tj/g;
  const arrayLiteralRe = /\[(.*?)\]\s*TJ/gs;
  const hexRe = /<([0-9a-fA-F\s]{2,4000})>\s*Tj/g;

  for (const match of raw.matchAll(literalRe)) {
    parts.push(decodePdfLiteral(match[0].replace(/\)\s*Tj$/, '').slice(1)));
  }
  for (const match of raw.matchAll(arrayLiteralRe)) {
    const segment = match[1] || '';
    const literals = [...segment.matchAll(/\((?:\\.|[^\\)]){1,1000}\)/g)]
      .map((item) => decodePdfLiteral(item[0].slice(1, -1)));
    const hexes = [...segment.matchAll(/<([0-9a-fA-F\s]{2,2000})>/g)]
      .map((item) => decodePdfHex(item[1]));
    const joined = [...literals, ...hexes].join('');
    if (joined) parts.push(joined);
  }
  for (const match of raw.matchAll(hexRe)) {
    parts.push(decodePdfHex(match[1]));
  }

  const text = parts.join('\n').replace(/[^\S\n]+/g, ' ');
  if (!normalizeText(text)) {
    throw new Error('没有从 PDF 里读到可用文字。它可能是扫描件，或文字被压缩/加密。');
  }
  return text;
};

export const parseChatFile = async (file: File): Promise<ParsedChatFile> => {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('文件太大了，第一版先限制在 8MB 以内');
  }

  const extension = getExtension(file.name);
  const mimeType = file.type || 'application/octet-stream';
  let rawText = '';

  if (['txt', 'md', 'markdown', 'csv', 'log'].includes(extension) || mimeType.startsWith('text/')) {
    rawText = await file.text();
  } else if (extension === 'json' || mimeType.includes('json')) {
    const text = await file.text();
    try {
      rawText = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      rawText = text;
    }
  } else if (extension === 'docx' || mimeType.includes('wordprocessingml.document')) {
    rawText = await parseDocx(file);
  } else if (extension === 'pdf' || mimeType === 'application/pdf') {
    rawText = await parsePdfBestEffort(file);
  } else {
    throw new Error('暂时只支持 txt、md、csv、json、docx、pdf');
  }

  const limited = limitText(rawText);
  if (!limited.text) throw new Error('文件里没有读到文字内容');

  return {
    name: file.name,
    mimeType,
    size: file.size,
    extension,
    text: limited.text,
    truncated: limited.truncated,
  };
};
