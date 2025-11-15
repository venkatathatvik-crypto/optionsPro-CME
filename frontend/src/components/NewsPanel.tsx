// src/components/NewsPanel.tsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAppStore } from '../store/useAppStore';

interface NewsArticle {
  title: string;
  description?: string | null;
  url: string;
  source?: string | null;
  publishedAt?: string | null;
}

interface NewsResponse {
  symbol: string;
  query: string;
  articles: NewsArticle[];
}

const API_URL = 'http://127.0.0.1:8000/api/v1';

export const NewsPanel: React.FC = () => {
  const theme = useAppStore((s) => s.theme);
  const symbol = useAppStore((s) => s.currentSymbol);
  const [data, setData] = useState<NewsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchNews = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/news`, { params: { symbol } });
      setData(res.data);
    } catch (e) {
      setData({ symbol, query: '', articles: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
    const id = setInterval(fetchNews, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [symbol]);

  return (
    <div className={`${theme === 'dark' ? 'bg-gray-800 border border-gray-700' : 'bg-white'} rounded-xl shadow p-4`}> 
      <div className="flex items-center justify-between mb-3">
        <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>News & Sentiment</h3>
        <button onClick={fetchNews} className="text-sm text-blue-500 hover:underline">Refresh</button>
      </div>
      {loading && <div className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>Loading news...</div>}
      {!loading && (!!data?.articles.length ? (
        <ul className="space-y-3">
          {data.articles.map((a, idx) => (
            <li key={idx} className={`${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'} rounded p-3`}>
              <a href={a.url} target="_blank" rel="noreferrer" className={`block font-medium ${theme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}>
                {a.title}
              </a>
              {a.description && (
                <p className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'} text-sm mt-1`}>{a.description}</p>
              )}
              <div className={`text-xs mt-2 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>
                {a.source ? a.source : 'News'}{a.publishedAt ? ` • ${new Date(a.publishedAt).toLocaleString()}` : ''}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className={`${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>No recent news found.</div>
      ))}
    </div>
  );
};
