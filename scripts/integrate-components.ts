/**
 * Integration helper - adds already-created components to page
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const pagePath = join(process.cwd(), 'app', 'page.tsx');
let content = readFileSync(pagePath, 'utf-8');

// List of components to add
const components = [
  { name: 'momentum-indicator', camel: 'momentumIndicator' },
  { name: 'trend-scanner', camel: 'trendScanner' },
  { name: 'volatility-meter', camel: 'volatilityMeter' },
];

for (const comp of components) {
  // Add import if not exists
  const importStmt = `import { ${comp.camel} } from '@/components/dashboard/${comp.name}';`;
  if (!content.includes(importStmt)) {
    content = content.replace(
      /import \{[^}]+\} from "lucide-react"/,
      (m) => m + '\n' + importStmt
    );
    console.log('Added import:', comp.camel);
  }

  // Add JSX if not exists
  const marker = `🤖 Agent: ${comp.name}`;
  if (!content.includes(marker)) {
    const jsx = `
      {/* 🤖 Agent: ${comp.name} */}
      <div style={{
        background: 'rgba(139, 92, 246, 0.1)',
        border: '1px solid rgba(139, 92, 246, 0.3)',
        borderRadius: '12px',
        padding: '12px',
        marginTop: '8px'
      }}>
        <div style={{ fontSize: '11px', color: '#a78bfa', marginBottom: '6px' }}>
          ${comp.camel}
        </div>
        <${comp.camel} coin="bitcoin" />
      </div>`;

    // Insert before final </div>
    content = content.replace(
      /(\s+<\/div>\s+\n\s+<\/div>\s+\n\s+\)\s*})/,
      jsx + '\n$1'
    );
    console.log('Added JSX:', comp.camel);
  }
}

writeFileSync(pagePath, content);
console.log('Done!');
