import React, { useState, useEffect } from 'react';
import { Calculator, X, AlertCircle, TrendingDown, DollarSign, Info } from 'lucide-react';

interface PositionSizeCalculatorProps {
  isOpen: boolean;
  onClose: () => void;
  defaultBalance?: number;
}

export const PositionSizeCalculator: React.FC<PositionSizeCalculatorProps> = ({
  isOpen,
  onClose,
  defaultBalance = 10000,
}) => {
  // State management
  const [accountBalance, setAccountBalance] = useState<number | ''>(defaultBalance);
  const [riskPercent, setRiskPercent] = useState<number | ''>(1);
  const [stopLossPips, setStopLossPips] = useState<number | ''>(50);
  const [pipValue, setPipValue] = useState<number | ''>(10); // Default to $10 per pip (Standard Lot)

  // Calculation Results
  const [riskAmount, setRiskAmount] = useState<number>(0);
  const [positionSize, setPositionSize] = useState<number>(0);

  // Real-time calculation
  useEffect(() => {
    const balance = Number(accountBalance);
    const risk = Number(riskPercent);
    const sl = Number(stopLossPips);
    const pv = Number(pipValue);

    if (balance > 0 && risk > 0 && sl > 0 && pv > 0) {
      // Calculate Dollar Risk
      const calculatedRisk = (balance * risk) / 100;
      setRiskAmount(calculatedRisk);

      // Calculate Position Size (Units)
      // Formula: (Risk Amount) / (Stop Loss in Pips * Pip Value)
      const calculatedPosition = calculatedRisk / (sl * pv);
      setPositionSize(calculatedPosition);
    } else {
      setRiskAmount(0);
      setPositionSize(0);
    }
  }, [accountBalance, riskPercent, stopLossPips, pipValue]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="calculator-title"
    >
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-2 text-slate-100">
            <Calculator className="w-5 h-5 text-blue-400" />
            <h2 id="calculator-title" className="font-semibold text-lg">Position Size Calculator</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
            aria-label="Close calculator"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          
          {/* Inputs Grid */}
          <div className="grid grid-cols-1 gap-4">
            
            {/* Account Balance */}
            <div className="space-y-1.5">
              <label htmlFor="acc-balance" className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Account Balance
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-slate-500">$</span>
                </div>
                <input
                  id="acc-balance"
                  type="number"
                  value={accountBalance}
                  onChange={(e) => setAccountBalance(e.target.value ? Number(e.target.value) : '')}
                  className="w-full pl-8 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder-slate-600"
                  placeholder="10000"
                />
              </div>
            </div>

            {/* Risk & Stop Loss Row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="risk-percent" className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Risk (%)
                </label>
                <div className="relative">
                  <input
                    id="risk-percent"
                    type="number"
                    value={riskPercent}
                    onChange={(e) => setRiskPercent(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder-slate-600"
                    placeholder="1.0"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <span className="text-slate-500 text-sm">%</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="stop-loss" className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Stop Loss (Pips)
                </label>
                <input
                  id="stop-loss"
                  type="number"
                  value={stopLossPips}
                  onChange={(e) => setStopLossPips(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder-slate-600"
                  placeholder="50"
                />
              </div>
            </div>

            {/* Advanced: Pip Value */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="pip-value" className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Pip Value (USD)
                </label>
                <span className="text-[10px] text-slate-500 flex items-center gap-1">
                  <Info className="w-3 h-3" /> Default: $10
                </span>
              </div>
              <input
                id="pip-value"
                type="number"
                value={pipValue}
                onChange={(e) => setPipValue(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder-slate-600"
                placeholder="10"
              />
            </div>
          </div>

          {/* Results Section */}
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50 space-y-4">
            
            {/* Position Size (Primary Result) */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-300">
                <TrendingDown className="w-4 h-4 text-blue-400" />
                <span className="font-medium">Position Size</span>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-blue-400 font-mono tracking-tight">
                  {positionSize.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
                <span className="text-xs text-slate-500 ml-2">Units</span>
              </div>
            </div>

            <div className="h-px bg-slate-700/50" />

            {/* Monetary Risk (Secondary Result) */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-300">
                <DollarSign className="w-4 h-4 text-rose-400" />
                <span className="font-medium">Monetary Risk</span>
              </div>
              <div className="text-right">
                <span className="text-lg font-semibold text-rose-400 font-mono">
                  ${riskAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

          </div>

          {/* Warning Note */}
          <div className="flex items-start gap-3 p-3 bg-amber-950/30 border border-amber-900/50 rounded-lg">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200/70 leading-relaxed">
              Calculations are estimates. Ensure pip value matches your specific asset (e.g., XAU/USD usually $10, Crypto often $1 or user-defined).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};