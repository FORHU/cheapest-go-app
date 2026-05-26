const fs = require('fs');
const path = require('path');

const md = fs.readFileSync(path.join(__dirname, 'travelgatex-duffel-audit.md'), 'utf8');

const css = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 40px; color: #1a1a1a; line-height: 1.7; }
  h1 { font-size: 30px; border-bottom: 3px solid #1a1a1a; padding-bottom: 12px; margin-top: 0; }
  h2 { font-size: 20px; border-bottom: 1px solid #ddd; padding-bottom: 6px; margin-top: 40px; color: #222; page-break-after: avoid; }
  h3 { font-size: 16px; color: #333; margin-top: 24px; page-break-after: avoid; }
  h4 { font-size: 14px; color: #444; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 13px; page-break-inside: avoid; }
  th { background: #222; color: white; padding: 8px 12px; text-align: left; }
  td { border: 1px solid #ddd; padding: 7px 12px; vertical-align: top; }
  tr:nth-child(even) td { background: #f9f9f9; }
  code { background: #f0f0f0; padding: 2px 5px; border-radius: 3px; font-size: 12px; font-family: Consolas, Monaco, monospace; }
  pre { background: #f4f4f4; padding: 14px 16px; border-radius: 4px; font-size: 12px; line-height: 1.5; border-left: 4px solid #333; overflow-x: auto; page-break-inside: avoid; }
  pre code { background: none; padding: 0; font-size: 12px; }
  hr { border: none; border-top: 2px solid #eee; margin: 32px 0; }
  ul, ol { padding-left: 22px; }
  li { margin: 3px 0; }
  p { margin: 10px 0; }
  .cover { text-align: center; padding: 80px 0 50px; border-bottom: 3px solid #1a1a1a; margin-bottom: 48px; }
  .cover h1 { border: none; font-size: 38px; margin-bottom: 8px; }
  .cover .subtitle { font-size: 17px; color: #444; margin: 6px 0; }
  .cover .meta { font-size: 13px; color: #888; margin-top: 24px; line-height: 2; }
  strong { color: #111; }
  @media print {
    body { margin: 0; }
    h2 { page-break-before: auto; }
    pre, table { page-break-inside: avoid; }
  }
`;

// Extract frontmatter
const fmMatch = md.match(/^---\n([\s\S]*?)\n---\n/);
let title = 'TravelgateX & Duffel Integration Audit';
let subtitle = '';
let date = '';
if (fmMatch) {
  const fm = fmMatch[1];
  const t = fm.match(/title:\s*"?(.+?)"?\s*$/m);
  const s = fm.match(/subtitle:\s*"?(.+?)"?\s*$/m);
  const d = fm.match(/date:\s*"?(.+?)"?\s*$/m);
  if (t) title = t[1];
  if (s) subtitle = s[1];
  if (d) date = d[1];
}

let body = md.replace(/^---[\s\S]*?---\n/, '');

// Convert markdown to HTML
function mdToHtml(text) {
  // Fenced code blocks (must come before inline code)
  text = text.replace(/```[\w]*\n([\s\S]*?)```/gm, (_, code) =>
    `<pre><code>${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`
  );

  // Tables
  text = text.replace(/^(\|.+\|)\n\|[-| :]+\|\n((?:\|.+\|\n?)+)/gm, (_, header, rows) => {
    const ths = header.split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('');
    const trs = rows.trim().split('\n').map(row =>
      `<tr>${row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('')}</tr>`
    ).join('\n');
    return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
  });

  // Headings
  text = text.replace(/^# (.+)$/gm, `<div class="cover"><h1>${title}</h1><div class="subtitle">${subtitle}</div><div class="meta">Date: ${date}<br>Project: cheapest-go-app</div></div>`);
  text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  text = text.replace(/^#### (.+)$/gm, '<h4>$1</h4>');

  // HR
  text = text.replace(/^---$/gm, '<hr>');

  // Bold and inline code
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // Checkboxes
  text = text.replace(/^- \[ \] (.+)$/gm, '<li>☐ $1</li>');
  text = text.replace(/^- \[x\] (.+)$/gm, '<li>☑ $1</li>');

  // Lists
  text = text.replace(/^- (.+)$/gm, '<li>$1</li>');
  text = text.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul>${m}</ul>\n`);

  // Paragraphs (lines not starting with HTML tags)
  text = text.replace(/^(?!<[a-zA-Z\/☐☑])(.+)$/gm, '<p>$1</p>');

  return text;
}

const htmlContent = mdToHtml(body);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${css}</style>
</head>
<body>
${htmlContent}
</body>
</html>`;

const outPath = path.join(__dirname, 'travelgatex-duffel-audit.html');
fs.writeFileSync(outPath, html);
console.log('Generated:', outPath);
console.log('Open this file in your browser and press Ctrl+P → Save as PDF');
