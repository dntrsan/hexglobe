let apiKey = localStorage.getItem('owm_api_key') ?? '';
let weatherActive = false;

export function getApiKey(): string { return apiKey; }
export function isWeatherActive(): boolean { return weatherActive && !!apiKey; }

export function initWeatherUI(): void {
  const input  = document.getElementById('weather-key') as HTMLInputElement;
  const button = document.getElementById('apply-key')   as HTMLButtonElement;
  const status = document.getElementById('weather-status') as HTMLSpanElement;

  if (apiKey) {
    input.value = apiKey;
    status.textContent = '✓ 保存済み（未検証）';
    status.style.color = 'rgba(180,210,255,0.8)';
    weatherActive = true;
  }

  button.addEventListener('click', async () => {
    const key = input.value.trim();
    if (!key) {
      setStatus('キーが空です', 'warn');
      return;
    }

    // Rough format check: OWM keys are 32-char hex strings
    if (!/^[a-f0-9]{32}$/i.test(key)) {
      setStatus('形式が正しくありません（32文字の英数字）', 'warn');
      return;
    }

    setStatus('確認中...', 'info');
    apiKey = key;
    localStorage.setItem('owm_api_key', key);

    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=35.68&lon=139.76&appid=${key}&units=metric`;
      const res  = await fetch(url);
      const data = await res.json() as Record<string, unknown>;

      if (res.ok) {
        weatherActive = true;
        setStatus('✓ 有効', 'ok');
      } else {
        weatherActive = false;
        // Show OWM's own error message so user knows what happened
        const owmMsg = String(data.message ?? res.status);

        if (res.status === 401) {
          // OWM returns 401 "Invalid API key" for BOTH wrong keys AND
          // newly created keys that haven't been activated yet (up to 2 hours).
          // Save and enable the key anyway — it will start working once active.
          weatherActive = true;
          setStatus('⏳ キーを保存しました。有効化待ちの場合は最大2時間かかります（登録直後は正しいキーでも401が返ります）', 'warn');
        } else {
          setStatus(`✗ エラー ${res.status}: ${owmMsg}`, 'error');
        }
      }
    } catch (err) {
      weatherActive = false;
      setStatus('✗ ネットワークエラー（CORS or オフライン）', 'error');
      console.error('[weather] fetch failed:', err);
    }
  });

  function setStatus(msg: string, kind: 'ok' | 'warn' | 'error' | 'info') {
    status.textContent = msg;
    const colors = {
      ok:    'rgba(100,220,100,0.85)',
      warn:  'rgba(255,200,80,0.85)',
      error: 'rgba(255,100,100,0.85)',
      info:  'rgba(180,210,255,0.7)',
    };
    status.style.color = colors[kind];
  }
}

// ── Weather data fetch ────────────────────────────────────────────────────────
const weatherCache = new Map<string, number>();
let lastFetchTime = 0;
const FETCH_INTERVAL = 600_000; // 10 min

const SAMPLE_POINTS: [number, number][] = [
  [35.68, 139.76], [28.61, 77.21],  [51.50, -0.12],  [40.71, -74.01],
  [48.85, 2.35],   [-33.87,151.21], [55.75, 37.62],  [39.90, 116.40],
  [19.43,-99.13],  [-23.55,-46.63], [1.35, 103.82],  [25.20, 55.27],
  [30.04, 31.24],  [-26.20, 28.05], [6.52, 3.38],    [13.75, 100.50],
  [-34.60,-58.38], [41.00, 28.97],  [23.13, 113.26], [37.56, 126.98],
];

export async function fetchWeatherGrid(): Promise<Map<string, number>> {
  if (!isWeatherActive()) return weatherCache;
  if (Date.now() - lastFetchTime < FETCH_INTERVAL && weatherCache.size > 0) return weatherCache;

  const fetches = SAMPLE_POINTS.map(([lat, lng]) =>
    fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => {
        if (!d) return;
        weatherCache.set(`${lat.toFixed(1)},${lng.toFixed(1)}`, (d.clouds?.all ?? 0) / 100);
      })
      .catch(() => {}),
  );

  await Promise.all(fetches);
  lastFetchTime = Date.now();
  return weatherCache;
}
