// src/lib/htmlToMd.js
// HTML → Markdown conversion shared by the DOCX import pipeline (mammoth
// output) and the Doc Studio editor's paste-HTML handler. Walks a DOM tree
// with DOMParser — pure browser APIs, no dependencies. Moved verbatim from
// src/api/claudeApi.js so both call sites use one converter.
export const htmlToMd = html => {
  const walk = node => {
    if (node.nodeType === 3 /* TEXT_NODE */) return node.textContent;
    if (node.nodeType !== 1 /* ELEMENT_NODE */) return '';

    const tag = node.tagName.toLowerCase();
    const children = Array.from(node.childNodes).map(walk).join('');

    switch (tag) {
      case 'h1':
        return `# ${children.trim()}\n\n`;
      case 'h2':
        return `## ${children.trim()}\n\n`;
      case 'h3':
        return `### ${children.trim()}\n\n`;
      case 'h4':
      case 'h5':
      case 'h6':
        return `**${children.trim()}**\n\n`;
      case 'p': {
        const trimmed = children.trim();
        return trimmed ? `${trimmed}\n\n` : '';
      }
      case 'strong':
      case 'b':
        return `**${children}**`;
      case 'em':
      case 'i':
        return `*${children}*`;
      case 'u':
        return children; // underline — no Markdown equiv, strip
      case 'br':
        return '\n';
      case 'ul':
        return `${children}\n`;
      case 'ol':
        return `${children}\n`;
      case 'li':
        return `- ${children.trim()}\n`;
      case 'a': {
        const href = node.getAttribute('href') || '';
        const label = children.trim() || href;
        return href ? `[${label}](${href})` : label;
      }
      case 'img': {
        const src = node.getAttribute('src') || '';
        const alt = node.getAttribute('alt') || 'image';
        return src ? `\n![${alt}](${src})\n` : '';
      }
      case 'table': {
        // GitHub-flavored tables need a | --- | separator after the header
        // row or renderers treat the rows as plain text.
        const rows = children.split('\n').filter(l => l.trim().startsWith('|'));
        if (!rows.length) return `${children}\n`;
        const cols = Math.max(rows[0].split('|').length - 2, 1);
        const sep = `| ${Array.from({ length: cols }, () => '---').join(' | ')} |`;
        return [rows[0], sep, ...rows.slice(1)].join('\n') + '\n\n';
      }
      case 'thead':
      case 'tbody':
      case 'tfoot':
        return children;
      case 'tr': {
        // Collect cells as a pipe-delimited row
        const cells = Array.from(node.children)
          .map(cell => Array.from(cell.childNodes).map(walk).join('').trim().replace(/\|/g, '\\|'))
          .join(' | ');
        return `| ${cells} |\n`;
      }
      case 'td':
      case 'th':
        return children; // handled by tr
      case 'code':
        return `\`${children}\``;
      case 'pre':
        return `\`\`\`\n${children}\n\`\`\`\n\n`;
      case 'blockquote':
        return (
          children
            .split('\n')
            .map(l => (l ? `> ${l}` : ''))
            .join('\n') + '\n\n'
        );
      case 'hr':
        return `---\n\n`;
      // Skip structural wrappers — just return their children
      case 'div':
      case 'section':
      case 'article':
      case 'header':
      case 'footer':
      case 'main':
      case 'span':
      case 'body':
      case 'html':
        return children;
      default:
        return children;
    }
  };

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return walk(doc.body)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};
