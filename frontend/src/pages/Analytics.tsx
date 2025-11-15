// src/pages/Analytics.tsx
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAppStore } from '../store/useAppStore';
import { NewsPanel } from '../components/NewsPanel';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from 'recharts';

const API_URL = 'http://127.0.0.1:8000/api/v1';

interface StrikeAnalytics {
  strike: number;
  ce_oi: number;
  pe_oi: number;
  ce_vol: number;
  pe_vol: number;
  ce_iv: number;
  pe_iv: number;
  ce_oi_change: number;
  pe_oi_change: number;
}

interface AnalyticsResponse {
  symbol: string;
  timestamp: string;
  pcr: number;
  strikes: StrikeAnalytics[];
}

interface SentimentResponse {
  symbol: string;
  pcr: number;
  insight: string;
}

export const Analytics: React.FC = () => {
  const theme = useAppStore((s) => s.theme);
  const symbol = useAppStore((s) => s.currentSymbol);

  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [sentiment, setSentiment] = useState<SentimentResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [a, s] = await Promise.all([
        axios.get(`${API_URL}/analytics/${symbol}`),
        axios.get(`${API_URL}/sentiment/${symbol}`),
      ]);
      setData(a.data);
      setSentiment(s.data);
    } catch (e) {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, 60 * 1000);
    return () => clearInterval(id);
  }, [symbol]);

  const chartRows = useMemo(() => {
    if (!data) return [] as { strike: number; ceOI: number; peOI: number; totalOI: number; ceVol: number; peVol: number; totalVol: number; ceIV: number; peIV: number; ceOIChg: number; peOIChg: number; netOIChg: number; }[];
    return data.strikes.map((s: StrikeAnalytics) => ({
      strike: s.strike,
      ceOI: s.ce_oi,
      peOI: s.pe_oi,
      totalOI: s.ce_oi + s.pe_oi,
      ceVol: s.ce_vol,
      peVol: s.pe_vol,
      totalVol: s.ce_vol + s.pe_vol,
      ceIV: s.ce_iv,
      peIV: s.pe_iv,
      ceOIChg: s.ce_oi_change,
      peOIChg: s.pe_oi_change,
      netOIChg: s.ce_oi_change + s.pe_oi_change,
    }));
  }, [data]);

  return (
    <div className={`p-6 ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'} min-h-screen`}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className={`${theme === 'dark' ? 'bg-gray-800 border border-gray-700' : 'bg-white'} rounded-xl shadow p-5`}> 
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>{symbol} Analytics</h1>
              <div className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} text-sm`}>Updated {data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : '-'}</div>
            </div>
            <div className="text-right">
              <div className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>PCR</div>
              <div className={`text-2xl font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>{data?.pcr?.toFixed?.(2) ?? '-'}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Volume vs OI by Strike */}
            <div className={`${theme === 'dark' ? 'bg-gray-800 border border-gray-700' : 'bg-white'} rounded-xl shadow p-4`}>
              <h3 className={`mb-3 font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>Volume vs OI (by Strike)</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#374151' : '#e5e7eb'} />
                    <XAxis dataKey="strike" stroke={theme === 'dark' ? '#9ca3af' : '#6b7280'} />
                    <YAxis yAxisId="left" stroke={theme === 'dark' ? '#9ca3af' : '#6b7280'} />
                    <YAxis yAxisId="right" orientation="right" stroke={theme === 'dark' ? '#9ca3af' : '#6b7280'} />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="totalVol" name="Total Volume" fill="#60a5fa" />
                    <Bar yAxisId="right" dataKey="totalOI" name="Total OI" fill="#34d399" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Change in OI by Strike */}
            <div className={`${theme === 'dark' ? 'bg-gray-800 border border-gray-700' : 'bg-white'} rounded-xl shadow p-4`}>
              <h3 className={`mb-3 font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>Change in OI (by Strike)</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#374151' : '#e5e7eb'} />
                    <XAxis dataKey="strike" stroke={theme === 'dark' ? '#9ca3af' : '#6b7280'} />
                    <YAxis stroke={theme === 'dark' ? '#9ca3af' : '#6b7280'} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="ceOIChg" name="CE OI Chg" fill="#f59e0b" />
                    <Bar dataKey="peOIChg" name="PE OI Chg" fill="#10b981" />
                    <Bar dataKey="netOIChg" name="Net OI Chg" fill="#6366f1" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* IV by Strike */}
            <div className={`${theme === 'dark' ? 'bg-gray-800 border border-gray-700' : 'bg-white'} rounded-xl shadow p-4`}>
              <h3 className={`mb-3 font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>Implied Volatility (by Strike)</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#374151' : '#e5e7eb'} />
                    <XAxis dataKey="strike" stroke={theme === 'dark' ? '#9ca3af' : '#6b7280'} />
                    <YAxis stroke={theme === 'dark' ? '#9ca3af' : '#6b7280'} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="ceIV" name="CE IV" stroke="#3b82f6" dot={false} />
                    <Line type="monotone" dataKey="peIV" name="PE IV" stroke="#ef4444" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Right rail: AI summary + News */}
          <div className="space-y-6">
            {/* AI-generated Summary */}
            <div className={`${theme === 'dark' ? 'bg-gray-800 border border-gray-700' : 'bg-white'} rounded-xl shadow p-4`}>
              <h3 className={`mb-3 font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>AI Summary</h3>
              {loading && <div className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>Generating...</div>}
              {!loading && (
                <div className={`${theme === 'dark' ? 'text-gray-300' : 'text-gray-700'} text-sm leading-6`}>
                  <p><strong>Why is volume increasing?</strong> {chartRows.some((r: { totalVol: number }) => r.totalVol > 0) ? 'Volume spikes at certain strikes suggest active positioning; cross-check with OI change for fresh build-up vs unwinds.' : 'No significant volume differentials detected.'}</p>
                  <p className="mt-2"><strong>Why OI dropping?</strong> {chartRows.some((r: { netOIChg: number }) => r.netOIChg < 0) ? 'Negative OI change with volume indicates long liquidation or short covering depending on CE/PE balance.' : 'Limited sign of unwinds at the moment.'}</p>
                  <p className="mt-2"><strong>Is market becoming bullish/bearish?</strong> {typeof data?.pcr === 'number' ? `PCR ${data.pcr.toFixed(2)}. ` : ''}{sentiment?.insight ?? '—'}</p>
                </div>
              )}
            </div>

            {/* News */}
            <NewsPanel />
          </div>
        </div>
      </div>
    </div>
  );
};
