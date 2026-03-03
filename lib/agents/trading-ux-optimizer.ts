/**
 * Trading UX Optimizer - Focuses on trader decision support
 * Optimizes the UI for better trading decisions and faster execution
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getLLMClient } from '../ai/llm-client';

export interface UXImprovement {
  category: 'decision_support' | 'speed' | 'clarity' | 'risk_management' | 'information';
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  implementation: string;
  impact: string;
  estimated_time: string;
}

export interface DecisionSupportElement {
  name: string;
  purpose: string;
  location: string;
  components: string[];
  data_requirements: string[];
}

export class TradingUXOptimizer {
  private llm = getLLMClient();
  private rootDir: string;

  constructor(rootDir: string = process.cwd()) {
    this.rootDir = rootDir;
  }

  /**
   * Analyze current trading UI and identify improvements
   */
  async analyzeTradingUI(): Promise<{
    current_elements: string[];
    missing_elements: DecisionSupportElement[];
    ux_improvements: UXImprovement[];
  }> {
    const appPage = join(this.rootDir, 'app/page.tsx');
    let content = '';

    if (existsSync(appPage)) {
      content = readFileSync(appPage, 'utf-8');
    }

    const currentElements = this.identifyCurrentElements(content);
    const missingElements = this.identifyMissingDecisionSupport(currentElements);
    const uxImprovements = await this.generateUXImprovements(content, currentElements);

    return {
      current_elements: currentElements,
      missing_elements: missingElements,
      ux_improvements: uxImprovements
    };
  }

  /**
   * Identify current decision support elements
   */
  private identifyCurrentElements(content: string): string[] {
    const elements: string[] = [];
    const lowerContent = content.toLowerCase();

    const decisionSupportChecks = {
      'Price Display': /price|current.*price|btc.*price|eth.*price/i,
      'Technical Indicators': /rsi|macd|ema|sma|bollinger|atr/i,
      'Position Management': /position|portfolio|holdings/i,
      'Trade Execution': /buy|sell|trade|order/i,
      'Risk Metrics': /leverage|risk|margin|liquidation/i,
      'Account Balance': /balance|equity|available/i,
      'Market Overview': /market|overview|dashboard/i,
      'Price Charts': /chart|graph|candlestick/i,
      'Volume Data': /volume|24h.*vol/i,
      'Support/Resistance': /support|resistance|levels/i,
    };

    for (const [name, pattern] of Object.entries(decisionSupportChecks)) {
      if (pattern.test(content)) {
        elements.push(name);
      }
    }

    return elements;
  }

  /**
   * Identify missing decision support elements
   */
  private identifyMissingDecisionSupport(current: string[]): DecisionSupportElement[] {
    const essentialElements: DecisionSupportElement[] = [
      {
        name: 'Quick Trade Panel',
        purpose: 'One-click trade execution with pre-set sizes',
        location: 'Right sidebar or floating panel',
        components: ['Buy Button', 'Sell Button', 'Size Selector', 'Leverage Slider'],
        data_requirements: ['current_price', 'available_balance', 'max_leverage']
      },
      {
        name: 'Position Calculator',
        purpose: 'Calculate position size based on risk percentage',
        location: 'Modal or dedicated section',
        components: ['Risk Input', 'Stop Loss Input', 'Take Profit Input', 'Result Display'],
        data_requirements: ['account_balance', 'entry_price', 'stop_distance']
      },
      {
        name: 'Risk/Reward Visualizer',
        purpose: 'Show R:R ratio visually for potential trades',
        location: 'Near trade entry or price panel',
        components: ['R:R Display', 'Visual Bar', 'Expected Value'],
        data_requirements: ['entry_price', 'stop_loss', 'take_profit']
      },
      {
        name: 'Market Sentiment Gauge',
        purpose: 'Quick view of overall market sentiment',
        location: 'Top header or dedicated panel',
        components: ['Fear/Greed Meter', 'Funding Rate Indicator', 'OI Change'],
        data_requirements: ['sentiment_api', 'funding_rates', 'open_interest']
      },
      {
        name: 'Alert System',
        purpose: 'Price and indicator alerts',
        location: 'Dedicated alerts panel',
        components: ['Alert List', 'Create Alert Button', 'Alert Types'],
        data_requirements: ['price_feeds', 'indicator_values']
      },
      {
        name: 'Trade Confirmation Modal',
        purpose: 'Pre-trade summary to prevent errors',
        location: 'Modal on trade submit',
        components: ['Order Summary', 'Risk Display', 'Confirm/Cancel'],
        data_requirements: ['order_details', 'account_state']
      },
      {
        name: 'P&L Dashboard',
        purpose: 'Track performance and win rate',
        location: 'Dedicated section or tab',
        components: ['Total P&L', 'Win Rate', 'Best Trade', 'Worst Trade'],
        data_requirements: ['trade_history']
      },
      {
        name: 'Correlation Matrix',
        purpose: 'See how positions relate to each other',
        location: 'Separate panel or modal',
        components: ['Heatmap', 'Correlation Values'],
        data_requirements: ['price_history', 'position_list']
      },
      {
        name: 'Liquidation Levels',
        purpose: 'See where large liquidations may occur',
        location: 'Chart overlay or panel',
        components: ['Liquidation Markers', 'Exchange Labels'],
        data_requirements: ['liquidation_data']
      },
      {
        name: 'Quick Position Size Buttons',
        purpose: 'Common position sizes for fast entry',
        location: 'Trade panel',
        components: ['25%', '50%', '75%', '100%', 'Max'],
        data_requirements: ['available_balance']
      },
      {
        name: 'Entry/Exit Signals',
        purpose: 'Clear buy/sell signals from strategies',
        location: 'Prominent display near price',
        components: ['Signal Badge', 'Confidence', 'Strategy Name'],
        data_requirements: ['strategy_signals']
      },
      {
        name: 'Market Heatmap',
        purpose: 'Quick view of market strength across assets',
        location: 'Dedicated section',
        components: ['Color Grid', 'Percentage Changes'],
        data_requirements: ['multi_asset_prices']
      }
    ];

    const currentLower = current.map(e => e.toLowerCase());

    return essentialElements.filter(element => {
      const nameLower = element.name.toLowerCase();
      return !currentLower.some(c => c.includes(nameLower.split(' ')[0]));
    });
  }

  /**
   * Generate UX improvements using LLM
   */
  private async generateUXImprovements(content: string, currentElements: string[]): Promise<UXImprovement[]> {
    const improvements: UXImprovement[] = [];

    // Quick wins - easy to implement, high impact
    const quickWins: UXImprovement[] = [
      {
        category: 'speed',
        title: 'Quick Trade Buttons',
        description: 'Add preset buy/sell buttons for common trade sizes',
        priority: 'high',
        implementation: 'Add buttons for 25%, 50%, 75%, 100% of available balance',
        impact: 'Reduces trade execution time by 50%',
        estimated_time: '30 min'
      },
      {
        category: 'risk_management',
        title: 'Position Size Calculator',
        description: 'Auto-calculate position size based on risk % and stop loss',
        priority: 'critical',
        implementation: 'Add calculator modal: Input risk % and stop distance → Output position size',
        impact: 'Prevents overleveraging and inconsistent risk',
        estimated_time: '1 hour'
      },
      {
        category: 'decision_support',
        title: 'Strategy Signal Display',
        description: 'Show clear buy/sell/hold signals with confidence',
        priority: 'high',
        implementation: 'Add signal badges near price with strategy name and confidence %',
        impact: 'Provides instant decision guidance',
        estimated_time: '1 hour'
      },
      {
        category: 'clarity',
        title: 'Risk/Reward Visualizer',
        description: 'Show R:R ratio as a visual bar for trade planning',
        priority: 'medium',
        implementation: 'Add visual component showing risk vs reward as colored bar',
        impact: 'Makes trade quality immediately apparent',
        estimated_time: '45 min'
      },
      {
        category: 'decision_support',
        title: 'Market Pulse Indicator',
        description: 'Single metric showing overall market health',
        priority: 'medium',
        implementation: 'Combine multiple indicators into 0-100 score',
        impact: 'Quick market assessment at a glance',
        estimated_time: '2 hours'
      }
    ];

    // Use LLM to analyze and suggest more improvements
    try {
      const prompt = `Analyze this crypto trading UI and suggest UX improvements focused on trader decision support:

Current elements: ${currentElements.join(', ')}

${content.substring(0, 5000)}

Suggest 3-5 improvements that would:
1. Help traders make faster decisions
2. Reduce errors in trade execution
3. Present critical information more clearly
4. Improve risk management

For each:
- category: decision_support|speed|clarity|risk_management|information
- title: short name
- description: what and why
- priority: critical|high|medium|low
- implementation: brief how-to
- impact: expected benefit
- estimated_time: implementation time

Return as JSON array.`;

      const response = await this.llm.generate([
        { role: 'user', content: prompt }
      ], 'You are a UX expert specializing in trading applications. Focus on decision support and speed.');

      const parsed = JSON.parse(response.content);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          improvements.push({
            category: item.category || 'decision_support',
            title: item.title,
            description: item.description,
            priority: item.priority || 'medium',
            implementation: item.implementation || '',
            impact: item.impact || '',
            estimated_time: item.estimated_time || '1 hour'
          });
        }
      }
    } catch (error) {
      console.error('LLM UX analysis failed');
    }

    return [...quickWins, ...improvements];
  }

  /**
   * Generate code for a UX improvement
   */
  async generateUXImprovementCode(improvement: UXImprovement, currentCode?: string): Promise<{
    component: string;
    code: string;
    import_statement?: string;
    usage_example?: string;
  }> {
    const prompt = `Generate React/TypeScript component for this UX improvement:

${JSON.stringify(improvement, null, 2)}

Requirements:
- TypeScript with proper types
- Tailwind CSS for styling
- Lucide React icons
- Accessible (ARIA labels)
- Responsive design
- Clean, professional trading UI aesthetic

${currentCode ? `Current code context:\n${currentCode.substring(0, 3000)}\n` : ''}

Return:
1. Complete component code
2. Import statement needed
3. Usage example

Wrap code in markdown blocks.`;

    try {
      const response = await this.llm.generate([
        { role: 'user', content: prompt }
      ], 'You are a React/UX expert. Generate clean, accessible trading UI components.');

      const code = this.extractCode(response.content);
      const componentName = this.componentNameFromTitle(improvement.title);

      return {
        component: componentName,
        code,
        import_statement: `import { ${componentName} } from '@/components/${componentName}';`,
        usage_example: `<${componentName} />`
      };
    } catch (error: any) {
      throw new Error(`Failed to generate code: ${error.message}`);
    }
  }

  /**
   * Generate an optimal trading layout
   */
  async generateOptimalLayout(): Promise<{
    layout_description: string;
    zones: Array<{ name: string; purpose: string; components: string[]; size: string }>;
    component_code?: string;
  }> {
    const prompt = `Design an optimal layout for a crypto trading dashboard focused on decision support.

Key requirements:
1. Price and signals must be prominent (top decision area)
2. Quick trade execution must be accessible (one click)
3. Risk information must be visible before trading
4. Support decision-making, not just display data

Provide:
1. Layout description (grid system)
2. Zones with their purpose and components
3. Relative sizes

Think like a professional trader - what do they need to see and do quickly?`;

    try {
      const response = await this.llm.generate([
        { role: 'user', content: prompt }
      ], 'You are a trading UI expert. Design layouts that support fast, informed trading decisions.');

      return {
        layout_description: response.content,
        zones: [
          {
            name: 'Top Bar - Decision Area',
            purpose: 'Critical info for immediate decisions',
            components: ['Current Price', 'Signal', 'Market Pulse', 'Quick Actions'],
            size: 'h-16'
          },
          {
            name: 'Main Content - Charts & Analysis',
            purpose: 'Price analysis and indicators',
            components: ['Price Chart', 'Indicators Overlay', 'Signals'],
            size: 'flex-1'
          },
          {
            name: 'Right Sidebar - Execution',
            purpose: 'Fast trade entry and position info',
            components: ['Quick Trade Panel', 'Position Size', 'Leverage', 'Submit'],
            size: 'w-80'
          },
          {
            name: 'Bottom Panel - Positions & Risk',
            purpose: 'Current positions and risk metrics',
            components: ['Open Positions', 'P&L', 'Risk Meter', 'Margin'],
            size: 'h-48'
          }
        ]
      };
    } catch (error) {
      return {
        layout_description: 'Standard trading layout',
        zones: []
      };
    }
  }

  /**
   * Apply a UX improvement to the app
   */
  async applyImprovement(improvement: UXImprovement): Promise<boolean> {
    try {
      const { component, code } = await this.generateUXImprovementCode(improvement);

      // Create components directory if needed
      const componentsDir = join(this.rootDir, 'components');
      const componentPath = join(componentsDir, `${component}.tsx`);

      // Write the component
      writeFileSync(componentPath, code);

      console.log(`✅ Created UX component: ${component}`);
      return true;
    } catch (error) {
      console.error('Failed to apply UX improvement:', error);
      return false;
    }
  }

  /**
   * Generate comprehensive UX optimization report
   */
  async generateUXReport(): Promise<string> {
    const analysis = await this.analyzeTradingUI();

    const prompt = `Generate a comprehensive UX optimization report for a crypto trading app.

Current Elements (${analysis.current_elements.length}):
${analysis.current_elements.map(e => `- ${e}`).join('\n')}

Missing Elements (${analysis.missing_elements.length}):
${analysis.missing_elements.slice(0, 5).map(e => `- ${e.name}: ${e.purpose}`).join('\n')}

Improvements Identified (${analysis.ux_improvements.length}):
${analysis.ux_improvements.slice(0, 5).map(i => `- [${i.priority}] ${i.title}: ${i.impact}`).join('\n')}

Create a report with:
1. Executive Summary
2. Critical Gaps
3. Quick Wins (high impact, low effort)
4. Strategic Improvements
5. Implementation Roadmap

Use markdown formatting.`;

    try {
      const response = await this.llm.generate([
        { role: 'user', content: prompt }
      ], 'You are a UX consultant. Create actionable improvement reports.');

      return response.content;
    } catch (error) {
      return 'Error generating report';
    }
  }

  private componentNameFromTitle(title: string): string {
    return title
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }

  private extractCode(content: string): string {
    const match = content.match(/```(?:typescript|tsx)?\s*\n([\s\S]+?)\n```/);
    return match ? match[1].trim() : content;
  }
}

// Singleton
let optimizerInstance: TradingUXOptimizer | null = null;

export function getTradingUXOptimizer(): TradingUXOptimizer {
  if (!optimizerInstance) {
    optimizerInstance = new TradingUXOptimizer();
  }
  return optimizerInstance;
}
