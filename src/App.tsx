import React, { useState, useEffect, useMemo } from 'react';
import { Search, TrendingUp, TrendingDown, Activity, Info, BarChart3, ChevronRight, RefreshCw, AlertTriangle, Wifi, WifiOff, Briefcase, ShieldAlert, Zap } from 'lucide-react';

// --- 定義 TypeScript 介面 ---
interface HistoryItem {
  date: string;
  close: number;
  pe: number;
}

interface Valuation {
  minPE: number;
  maxPE: number;
  cheapPrice: number;
  fairPrice: number;
  expensivePrice: number;
  eps: number;
}

interface StockData {
  source: string;
  isReal: boolean;
  symbol: string;
  name: string;
  currentPrice: number;
  change: string;
  currentPE: number | null;
  historyData: HistoryItem[];
  valuation: Valuation;
}

interface MaData {
  ma5: number;
  ma10: number;
  ma20: number;
  ma60: number;
  ma120: number;
  ma240: number;
}

// --- 真實 API 串接 (FinMind) ---
const fetchRealStockData = async (symbol: string): Promise<StockData> => {
  const now = new Date();
  const threeYearsAgo = new Date();
  threeYearsAgo.setFullYear(now.getFullYear() - 3);
  
  const startDate = threeYearsAgo.toISOString().split('T')[0];
  const endDate = now.toISOString().split('T')[0];

  try {
    const [priceRes, perRes, infoRes] = await Promise.all([
      fetch(`https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${symbol}&start_date=${startDate}&end_date=${endDate}`),
      fetch(`https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPER&data_id=${symbol}&start_date=${startDate}&end_date=${endDate}`),
      fetch(`https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInfo&data_id=${symbol}`)
    ]);

    const priceJson = await priceRes.json();
    const perJson = await perRes.json();
    const infoJson = await infoRes.json();

    if (!priceJson.data || priceJson.data.length === 0) {
      throw new Error('查無資料或代號錯誤');
    }

    const rawPrices = priceJson.data.reverse();
    const rawPERs = perJson.data.reverse();
    const stockName = infoJson.data && infoJson.data.length > 0 ? infoJson.data[0].stock_name : symbol;

    const currentPrice = rawPrices[0].close;
    const currentPERData = rawPERs.length > 0 ? rawPERs[0].p_e_ratio : null;
    
    const prevPrice = rawPrices[1] ? rawPrices[1].close : currentPrice;
    const change = (currentPrice - prevPrice).toFixed(2);

    const historyData: HistoryItem[] = rawPrices.map((d: any) => ({
      date: d.date,
      close: d.close,
      pe: rawPERs.find((p: any) => p.date === d.date)?.p_e_ratio || 0
    }));

    const validPEs = rawPERs
      .map((d: any) => d.p_e_ratio)
      .filter((pe: number) => pe > 0 && pe < 200)
      .sort((a: number, b: number) => a - b);
    
    let minPE, maxPE, eps;
    
    if (validPEs.length > 10) {
      minPE = validPEs[Math.floor(validPEs.length * 0.1)];
      maxPE = validPEs[Math.floor(validPEs.length * 0.9)];
      const validCurrentPE = currentPERData || validPEs[0]; 
      eps = currentPrice / validCurrentPE;
    } else {
      minPE = 10;
      maxPE = 20;
      eps = currentPrice / 15;
    }

    const cheapPrice = eps * minPE;
    const expensivePrice = eps * maxPE;
    const fairPrice = (cheapPrice + expensivePrice) / 2;

    return {
      source: 'FinMind API',
      isReal: true,
      symbol,
      name: stockName,
      currentPrice,
      change,
      currentPE: currentPERData,
      historyData,
      valuation: {
        minPE,
        maxPE,
        cheapPrice,
        fairPrice,
        expensivePrice,
        eps
      }
    };

  } catch (error) {
    console.warn("API Fetch Error:", error);
    throw error;
  }
};

// --- 模擬數據生成器 (Fallback) ---
const getMockData = async (symbol: string): Promise<StockData> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const seed = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const generatePrices = (days: number) => {
        let price = 500 + (seed % 200); 
        const data = [];
        for (let i = 0; i < days; i++) {
          const change = Math.sin(i * 0.1) * 10 + (Math.random() - 0.5) * 5;
          price += change;
          if (price < 10) price = 10;
          data.push({
            date: new Date(Date.now() - (days - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            close: parseFloat(price.toFixed(2)),
            pe: parseFloat((price / (20 + (Math.random() * 5))).toFixed(2)) 
          });
        }
        return data.reverse(); 
      };

      const historyData = generatePrices(365 * 3); 
      const currentPrice = historyData[0].close;
      const currentPE = historyData[0].pe;
      const peValues = historyData.map(d => d.pe).sort((a, b) => a - b);
      const minPE = peValues[Math.floor(peValues.length * 0.1)]; 
      const maxPE = peValues[Math.floor(peValues.length * 0.9)]; 
      const eps = currentPrice / currentPE;

      resolve({
        source: '模擬數據 (API連線失敗)',
        isReal: false,
        symbol,
        name: symbol === '2330' ? '台積電(模)' : '模擬個股',
        currentPrice,
        change: (Math.random() * 10 - 5).toFixed(2),
        currentPE,
        historyData,
        valuation: { minPE, maxPE, cheapPrice: eps * minPE, fairPrice: eps * (minPE + maxPE)/2, expensivePrice: eps * maxPE, eps }
      });
    }, 500); 
  });
};

// --- 組件: 移動平均線卡片 ---
interface MACardProps {
  label: string;
  value: number;
  currentPrice: number;
}

const MACard: React.FC<MACardProps> = ({ label, value, currentPrice }) => {
  const isAbove = currentPrice > value;
  if (!value || value === 0) {
    return (
        <div className="flex flex-col items-center p-3 bg-slate-800/60 backdrop-blur-md rounded-lg border border-slate-700/50">
            <span className="text-xs text-slate-400 font-medium mb-1">{label}</span>
            <span className="text-base font-mono text-slate-500">--</span>
        </div>
    )
  }

  return (
    <div className="flex flex-col items-center p-3 bg-slate-800/60 backdrop-blur-md rounded-lg border border-slate-700/50 shadow-lg">
      <span className="text-xs text-slate-400 font-medium mb-1">{label}</span>
      <span className={`text-base font-bold font-mono tracking-wide ${isAbove ? 'text-red-400' : 'text-green-400'}`}>
        {value.toFixed(1)}
      </span>
    </div>
  );
};

// --- 組件: 評價燈號 ---
const ValuationBadge: React.FC<{ status: string }> = ({ status }) => {
  const styles: { [key: string]: string } = {
    '便宜價': 'bg-green-900/40 text-green-400 border-green-500/50 shadow-[0_0_15px_rgba(74,222,128,0.3)]',
    '合理價': 'bg-amber-900/40 text-amber-400 border-amber-500/50 shadow-[0_0_15px_rgba(251,191,36,0.3)]',
    '昂貴價': 'bg-red-900/40 text-red-400 border-red-500/50 shadow-[0_0_15px_rgba(248,113,113,0.3)]',
    '無資料': 'bg-slate-800 text-slate-400 border-slate-600',
  };

  const icon: { [key: string]: JSX.Element } = {
    '便宜價': <TrendingUp className="w-10 h-10 mb-2" />,
    '合理價': <Activity className="w-10 h-10 mb-2" />,
    '昂貴價': <Info className="w-10 h-10 mb-2" />, 
    '無資料': <AlertTriangle className="w-10 h-10 mb-2" />,
  };

  return (
    <div className={`flex flex-col items-center justify-center py-8 px-6 rounded-2xl border backdrop-blur-sm ${styles[status]} transition-all duration-500`}>
      {icon[status]}
      <h2 className="text-5xl font-black tracking-widest drop-shadow-lg">{status}</h2>
      <span className="text-sm opacity-90 mt-3 font-medium tracking-wide">
        {status === '無資料' ? '無法計算 P/E 區間' : '基於歷史 3 年本益比位階'}
      </span>
    </div>
  );
};

// --- 組件: 專業分析師評語 ---
interface AnalystInsightProps {
  stockData: StockData | null;
  maData: MaData | null;
  valuationStatus: string;
}

const AnalystInsight: React.FC<AnalystInsightProps> = ({ stockData, maData, valuationStatus }) => {
  if (!stockData || !maData) return null;

  let riskLevel = '中';
  let riskColor = 'text-amber-400';
  
  if (valuationStatus === '便宜價') {
    riskLevel = '低';
    riskColor = 'text-green-400';
  } else if (valuationStatus === '昂貴價') {
    riskLevel = '高';
    riskColor = 'text-red-400';
  }

  const isLongTermBull = stockData.currentPrice > maData.ma240;
  const isShortTermBull = stockData.currentPrice > maData.ma20;
  
  let commentary = '';
  
  if (valuationStatus === '便宜價') {
    commentary += `價值評估顯示 ${stockData.name} 目前具備顯著的安全邊際，本益比位於歷史低檔區，是長線價值投資者理想的佈局時機。`;
  } else if (valuationStatus === '合理價') {
    commentary += `目前股價反應其合理價值，市場預期已部分實現。建議採取「區間操作」策略，或等待回檔至更有吸引力的價位再行加碼。`;
  } else {
    commentary += `股價已進入歷史高估值區間，反映市場情緒過熱或已完全定價未來成長。此時追高風險收益比（Risk/Reward Ratio）較差，建議適度獲利了結或嚴設停利。`;
  }

  commentary += ' 技術面來看，';
  if (isLongTermBull) {
    if (isShortTermBull) {
      commentary += `股價穩站年線（240MA）與月線（20MA）之上，呈現「長多短多」的強勢格局，順勢操作即可，唯需留意乖離過大後的短線修正。`;
    } else {
      commentary += `雖然長線趨勢（年線）仍向上，但短線跌破月線，顯示籌碼進入整理階段。若能守穩季線（60MA），則視為多頭架構下的健康回檔。`;
    }
  } else {
    if (isShortTermBull) {
      commentary += `股價雖站回月線出現反彈，但上方仍有年線（${maData.ma240.toFixed(1)}）的反壓，判定為「空頭反彈」格局。搶短需手腳俐落，不宜過度戀戰。`;
    } else {
      commentary += `股價同時受制於月線與年線反壓，呈現「長空短空」的弱勢格局。在未帶量突破重要均線前，建議保守觀望，保留現金等待落底訊號。`;
    }
  }

  return (
    <div className="bg-gradient-to-br from-slate-800/60 to-slate-900/60 backdrop-blur-md p-6 rounded-3xl border border-blue-500/30 shadow-xl mt-6 animate-fade-in-up delay-400">
      <div className="flex items-center gap-3 mb-4 border-b border-slate-700/50 pb-4">
        <div className="bg-blue-600/20 p-2 rounded-full border border-blue-500/30">
          <Briefcase className="w-6 h-6 text-blue-400" />
        </div>
        <div>
          <h3 className="font-bold text-slate-100 text-lg">分析師觀點</h3>
          <p className="text-xs text-slate-400">Taiwan Stock Value Analyst</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-700/30 flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 text-slate-400" />
          <div>
            <p className="text-xs text-slate-500">目前風險等級</p>
            <p className={`font-bold text-lg ${riskColor}`}>{riskLevel}</p>
          </div>
        </div>
        <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-700/30 flex items-center gap-3">
          <Zap className="w-5 h-5 text-slate-400" />
          <div>
            <p className="text-xs text-slate-500">長線趨勢</p>
            <p className={`font-bold text-lg ${isLongTermBull ? 'text-red-400' : 'text-green-400'}`}>
              {isLongTermBull ? '多頭架構' : '空頭走勢'}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-slate-900/30 p-4 rounded-xl border border-slate-800">
        <p className="text-sm text-slate-300 leading-7 text-justify tracking-wide">
          {commentary}
        </p>
      </div>
    </div>
  );
};

// --- 主程式 ---
export default function App() {
  const [query, setQuery] = useState('');
  const [stockData, setStockData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    handleSearch('2330');
  }, []);

  const calculateMA = (data: HistoryItem[], days: number) => {
    if (!data || data.length < days) return 0;
    const sum = data.slice(0, days).reduce((acc, curr) => acc + curr.close, 0);
    return sum / days;
  };

  const handleSearch = async (symbolInput?: string) => {
    const symbol = symbolInput || query;
    if (!symbol) return;
    
    setLoading(true);
    setError(null);
    setStockData(null); 

    try {
      const data = await fetchRealStockData(symbol);
      setStockData(data);
    } catch (err) {
      console.log('Switching to mock data due to:', err);
      const mockData = await getMockData(symbol);
      setStockData(mockData);
      setError('無法取得即時資料，已切換至模擬展示模式。可能原因：代號錯誤、API 限流或該股無近期交易。');
    } finally {
      setLoading(false);
    }
  };

  const maData: MaData | null = useMemo(() => {
    if (!stockData) return null;
    return {
      ma5: calculateMA(stockData.historyData, 5),
      ma10: calculateMA(stockData.historyData, 10),
      ma20: calculateMA(stockData.historyData, 20),
      ma60: calculateMA(stockData.historyData, 60),
      ma120: calculateMA(stockData.historyData, 120),
      ma240: calculateMA(stockData.historyData, 240),
    };
  }, [stockData]);

  const valuationStatus = useMemo(() => {
    if (!stockData) return '無資料';
    const { currentPrice, valuation } = stockData;
    
    if (!valuation.cheapPrice || !valuation.expensivePrice) return '無資料';

    const lowerThreshold = (valuation.cheapPrice * 0.4 + valuation.fairPrice * 0.6);
    const upperThreshold = (valuation.fairPrice * 0.4 + valuation.expensivePrice * 0.6);

    if (currentPrice <= lowerThreshold) return '便宜價';
    if (currentPrice >= upperThreshold) return '昂貴價';
    return '合理價';
  }, [stockData]);

  const cursorPosition = useMemo(() => {
    if(!stockData || !stockData.valuation.cheapPrice) return 50;
    const { currentPrice, valuation } = stockData;
    const range = (valuation.expensivePrice * 1.2) - (valuation.cheapPrice * 0.8);
    const pos = ((currentPrice - (valuation.cheapPrice * 0.8)) / range) * 100;
    return Math.min(Math.max(pos, 0), 100);
  }, [stockData]);

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-100 pb-12 relative overflow-x-hidden">
      
      {/* 背景圖層 */}
      <div 
        className="fixed inset-0 z-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1611974765270-ca1258634369?q=80&w=2664&auto=format&fit=crop')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'grayscale(100%) contrast(120%)'
        }}
      />
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-slate-950/80 via-slate-950/90 to-slate-950 pointer-events-none"></div>

      {/* 內容層 */}
      <div className="relative z-10">
        {/* 頂部導航列 */}
        <div className="sticky top-0 z-20 px-4 py-4 backdrop-blur-xl bg-slate-950/70 border-b border-slate-800/50">
          <div className="max-w-md mx-auto flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 group">
                <input
                  type="text"
                  placeholder="輸入代號 (例: 2330)"
                  className="w-full pl-11 pr-4 py-3 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-inner"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3 transition-colors group-focus-within:text-blue-400" />
              </div>
              <button 
                onClick={() => handleSearch()}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-xl shadow-lg shadow-blue-900/20 active:scale-95 transition-all border border-blue-400/20"
              >
                {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <ChevronRight className="w-5 h-5" />}
              </button>
            </div>
            {/* 資料來源標示 */}
            {stockData && (
              <div className="flex justify-end items-center gap-1.5 px-1">
                {stockData.isReal ? 
                  <Wifi className="w-3 h-3 text-green-400" /> : 
                  <WifiOff className="w-3 h-3 text-amber-500" />
                }
                <span className={`text-[10px] ${stockData.isReal ? 'text-green-400/80' : 'text-amber-500/80'}`}>
                   來源: {stockData.source} {stockData.isReal && '(收盤價)'}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="max-w-md mx-auto px-4 mt-6 space-y-6">
          {error && (
            <div className="p-4 bg-amber-900/20 border border-amber-500/30 text-amber-200 rounded-xl text-sm backdrop-blur-md flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {stockData && !loading && (
            <>
              {/* 股票基本資訊 */}
              <div className="text-center animate-fade-in">
                <h1 className="text-3xl font-bold text-white tracking-tight drop-shadow-md">
                  {stockData.name} <span className="text-slate-400 text-xl font-normal ml-2">{stockData.symbol}</span>
                </h1>
                <div className="flex items-end justify-center gap-3 mt-2">
                  <span className="text-5xl font-mono font-bold text-white tracking-tighter drop-shadow-xl">
                    {stockData.currentPrice.toFixed(2)}
                  </span>
                  <span className={`px-2 py-1 rounded-lg text-sm font-bold mb-1.5 ${parseFloat(stockData.change) >= 0 ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-green-500/20 text-green-400 border border-green-500/30'}`}>
                    {parseFloat(stockData.change) >= 0 ? '▲' : '▼'} {Math.abs(stockData.change)}
                  </span>
                </div>
              </div>

              {/* 1. 核心評價區 */}
              <div className="animate-fade-in-up delay-100">
                <ValuationBadge status={valuationStatus} />
              </div>

              {/* 2. 移動平均線 (MA) */}
              <div className="bg-slate-800/40 backdrop-blur-md p-6 rounded-3xl border border-slate-700/50 shadow-xl animate-fade-in-up delay-200">
                <div className="flex items-center gap-2 mb-5">
                  <BarChart3 className="w-5 h-5 text-blue-400" />
                  <h3 className="font-bold text-slate-200 text-lg">移動平均線 (MA)</h3>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <MACard label="5日 (週)" value={maData?.ma5 || 0} currentPrice={stockData.currentPrice} />
                  <MACard label="10日 (雙週)" value={maData?.ma10 || 0} currentPrice={stockData.currentPrice} />
                  <MACard label="20日 (月)" value={maData?.ma20 || 0} currentPrice={stockData.currentPrice} />
                  <MACard label="60日 (季)" value={maData?.ma60 || 0} currentPrice={stockData.currentPrice} />
                  <MACard label="120日 (半年)" value={maData?.ma120 || 0} currentPrice={stockData.currentPrice} />
                  <MACard label="240日 (年)" value={maData?.ma240 || 0} currentPrice={stockData.currentPrice} />
                </div>
                <div className="mt-4 flex justify-center">
                   <p className="text-xs text-slate-400 px-3 py-1 bg-slate-900/50 rounded-full border border-slate-700/50">
                     紅字 = 股價站上均線 (強勢)
                   </p>
                </div>
              </div>

              {/* 3. 評價模型詳情 */}
              <div className="bg-slate-800/40 backdrop-blur-md p-6 rounded-3xl border border-slate-700/50 shadow-xl animate-fade-in-up delay-300">
                <div className="flex items-center gap-2 mb-6">
                  <TrendingUp className="w-5 h-5 text-blue-400" />
                  <h3 className="font-bold text-slate-200 text-lg">本益比河流圖模型</h3>
                </div>

                {stockData.valuation.cheapPrice ? (
                  <>
                    {/* 視覺化長條圖 */}
                    <div className="relative pt-8 pb-4 px-1">
                      {/* 漸層背景條 */}
                      <div className="h-3 bg-gradient-to-r from-green-500/80 via-amber-400/80 to-red-500/80 rounded-full w-full shadow-[0_0_10px_rgba(0,0,0,0.5)]"></div>
                      
                      {/* 游標 */}
                      <div 
                        className="absolute top-4 w-1.5 h-11 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)] transition-all duration-1000 z-10"
                        style={{ left: `${cursorPosition}%` }}
                      >
                        <div className="absolute -top-9 left-1/2 transform -translate-x-1/2 bg-slate-700 text-white text-xs px-2 py-1 rounded border border-slate-500 whitespace-nowrap shadow-lg">
                          目前 {stockData.currentPrice}
                        </div>
                        <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[6px] border-t-white"></div>
                      </div>
                    </div>

                    <div className="space-y-4 mt-6">
                      <div className="flex justify-between items-center pb-3 border-b border-slate-700/50">
                        <span className="text-sm text-slate-400">昂貴價 (P/E {stockData.valuation.maxPE?.toFixed(1)}x)</span>
                        <span className="font-mono font-bold text-red-400 text-lg">{stockData.valuation.expensivePrice?.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center pb-3 border-b border-slate-700/50">
                        <span className="text-sm text-slate-400">合理價 (P/E {((stockData.valuation.minPE + stockData.valuation.maxPE)/2).toFixed(1)}x)</span>
                        <span className="font-mono font-bold text-amber-400 text-lg">{stockData.valuation.fairPrice?.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-slate-400">便宜價 (P/E {stockData.valuation.minPE?.toFixed(1)}x)</span>
                        <span className="font-mono font-bold text-green-400 text-lg">{stockData.valuation.cheapPrice?.toFixed(2)}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    <AlertTriangle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>此標的無足夠本益比數據 (可能為虧損股或 ETF)</p>
                  </div>
                )}
                
                <div className="mt-6 bg-blue-900/20 border border-blue-500/20 p-4 rounded-xl">
                  <p className="text-xs text-blue-300 leading-relaxed flex items-start gap-2">
                    <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>
                      {stockData.isReal 
                        ? 'EPS 與 P/E 區間計算採計 FinMind 歷史數據。若遇到 ETF 或虧損個股，模型可能不適用。' 
                        : '目前為模擬數據模式，僅供介面展示。'}
                    </span>
                  </p>
                </div>
              </div>

              {/* 4. 分析師觀點 */}
              <AnalystInsight stockData={stockData} maData={maData} valuationStatus={valuationStatus} />
            </>
          )}

          {!stockData && !loading && !error && (
            <div className="text-center text-slate-600 mt-24">
              <Activity className="w-20 h-20 mx-auto mb-4 opacity-30" />
              <p className="text-slate-500">請輸入股票代號開始分析</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}