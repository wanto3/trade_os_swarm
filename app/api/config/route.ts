import { NextRequest, NextResponse } from 'next/server';
import { getPositionConfig } from '@/lib/services/position-calculator.service';
import { getSupportedSymbols } from '@/lib/services/crypto-data.service';

export async function GET(request: NextRequest) {
  try {
    const positionConfig = getPositionConfig();
    const supportedSymbols = getSupportedSymbols();

    return NextResponse.json({
      success: true,
      data: {
        maxLeverage: positionConfig.maxLeverage,
        maxRiskPerTrade: positionConfig.maxRiskPerTrade,
        minRiskReward: positionConfig.minRiskReward,
        accountBalance: positionConfig.accountBalance,
        supportedSymbols,
        priceUpdateInterval: 5000,
        signalUpdateInterval: 30000
      },
      timestamp: Date.now()
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now()
    }, { status: 500 });
  }
}
