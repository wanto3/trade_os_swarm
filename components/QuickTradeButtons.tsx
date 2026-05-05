import React from 'react';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';

// Types
interface QuickTradeButtonsProps {
  /** Current available balance for trading */
  balance: number;
  /** Current selected amount */
  currentAmount: number;
  /** Callback when amount changes */
  onAmountChange: (amount: number) => void;
  /** Trade mode: 'buy' or 'sell' */
  mode: 'buy' | 'sell';
  /** Custom percentage labels (optional) */
  percentages?: number[];
  /** Currency symbol to display */
  currencySymbol?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

interface PercentageButtonProps {
  percentage: number;
  balance: number;
  isSelected: boolean;
  onClick: () => void;
  currencySymbol: string;
  disabled: boolean;
  mode: 'buy' | 'sell';
}

// Helper to format currency
const formatCurrency = (value: number, symbol: string = '$'): string => {
  return `${symbol}${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

// Individual Percentage Button Component
const PercentageButton: React.FC<PercentageButtonProps> = ({
  percentage,
  balance,
  isSelected,
  onClick,
  currencySymbol,
  disabled,
  mode,
}) => {
  const amount = (balance * percentage) / 100;
  
  const baseStyles = `
    flex-1 flex flex-col items-center justify-center
    py-3 px-2 rounded-lg
    text-sm font-medium
    transition-all duration-200
    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900
    disabled:opacity-50 disabled:cursor-not-allowed
  `;
  
  const modeStyles = mode === 'buy'
    ? isSelected
      ? 'bg-green-500/20 text-green-400 border border-green-500/50 focus:ring-green-500'
      : 'bg-gray-800/50 text-gray-300 border border-gray-700 hover:bg-gray-700/50 hover:border-gray-600 focus:ring-gray-500'
    : isSelected
      ? 'bg-red-500/20 text-red-400 border border-red-500/50 focus:ring-red-500'
      : 'bg-gray-800/50 text-gray-300 border border-gray-700 hover:bg-gray-700/50 hover:border-gray-600 focus:ring-gray-500';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`Set ${percentage}% of balance (${formatCurrency(amount, currencySymbol)})`}
      className={`${baseStyles} ${modeStyles}`}
    >
      <span className="text-lg font-semibold">{percentage}%</span>
      <span className="text-xs opacity-70 mt-0.5">
        {formatCurrency(amount, currencySymbol)}
      </span>
    </button>
  );
};

// Main Component
export const QuickTradeButtons: React.FC<QuickTradeButtonsProps> = ({
  balance,
  currentAmount,
  onAmountChange,
  mode,
  percentages = [25, 50, 75, 100],
  currencySymbol = '$',
  disabled = false,
  className = '',
}) => {
  // Calculate which percentage is currently selected
  const getSelectedPercentage = (): number | null => {
    if (balance <= 0) return null;
    const exactPercentage = (currentAmount / balance) * 100;
    
    // Check if current amount matches any percentage (with small tolerance)
    for (const pct of percentages) {
      if (Math.abs(exactPercentage - pct) < 0.5) {
        return pct;
      }
    }
    return null;
  };

  const selectedPercentage = getSelectedPercentage();

  const handlePercentageClick = (percentage: number) => {
    const newAmount = (balance * percentage) / 100;
    onAmountChange(newAmount);
  };

  // Handle custom amount input
  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value) || 0;
    onAmountChange(Math.min(Math.max(0, value), balance));
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {mode === 'buy' ? (
            <TrendingUp className="w-4 h-4 text-green-400" aria-hidden="true" />
          ) : (
            <TrendingDown className="w-4 h-4 text-red-400" aria-hidden="true" />
          )}
          <span className="text-sm font-medium text-gray-300">
            Quick Select
          </span>
        </div>
        <span className="text-xs text-gray-500">
          Available: {formatCurrency(balance, currencySymbol)}
        </span>
      </div>

      {/* Percentage Buttons Grid */}
      <div 
        className="grid grid-cols-4 gap-2"
        role="group"
        aria-label="Quick trade amount percentages"
      >
        {percentages.map((percentage) => (
          <PercentageButton
            key={percentage}
            percentage={percentage}
            balance={balance}
            isSelected={selectedPercentage === percentage}
            onClick={() => handlePercentageClick(percentage)}
            currencySymbol={currencySymbol}
            disabled={disabled}
            mode={mode}
          />
        ))}
      </div>

      {/* Custom Amount Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <DollarSign className="h-4 w-4 text-gray-500" aria-hidden="true" />
        </div>
        <input
          type="number"
          value={currentAmount > 0 ? currentAmount : ''}
          onChange={handleCustomChange}
          disabled={disabled}
          placeholder="Custom amount"
          min={0}
          max={balance}
          step={0.01}
          aria-label="Custom trade amount"
          className={`
            w-full pl-10 pr-4 py-3
            bg-gray-800/50 border rounded-lg
            text-gray-100 placeholder-gray-500
            text-sm font-medium
            transition-colors duration-200
            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900
            disabled:opacity-50 disabled:cursor-not-allowed
            ${mode === 'buy' 
              ? 'focus:ring-green-500 border-gray-700 focus:border-green-500' 
              : 'focus:ring-red-500 border-gray-700 focus:border-red-500'
            }
          `}
        />
      </div>

      {/* Amount Summary */}
      <div 
        className="flex items-center justify-between text-sm"
        role="status"
        aria-live="polite"
      >
        <span className="text-gray-500">Selected Amount</span>
        <span className={`font-semibold ${mode === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
          {formatCurrency(currentAmount, currencySymbol)}
        </span>
      </div>
    </div>
  );
};

export default QuickTradeButtons;