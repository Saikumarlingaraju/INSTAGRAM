import { useEffect, useState, useCallback, useRef } from 'react';
import { GOOGLE_SHEETS_CSV_URL } from '../utils/constants';
import { createTheme, DEFAULT_THEME } from '../utils/theme';
import { loadImageForRendering } from '../utils/loadImage';

// ═══════════════════════════════════════════════════════
//  GOOGLE FONTS — loaded via FontFace API
// ═══════════════════════════════════════════════════════
const loadGoogleFonts = async () => {
  const specs = [
    {
      family: 'Bebas Neue',
      url: 'https://fonts.gstatic.com/s/bebasneue/v16/JTUSjIg69CK48gW7PXooxW5rygbi49c.woff2',
      descriptors: { weight: '400' },
    },
    {
      family: 'Poppins',
      url: 'https://fonts.gstatic.com/s/poppins/v22/pxiEyp8kv8JHgFVrJJfecg.woff2',
      descriptors: { weight: '400' },
    },
    {
      family: 'Poppins',
      url: 'https://fonts.gstatic.com/s/poppins/v22/pxiByp8kv8JHgFVrLGT9Z1JlFd2JQEl8qw.woff2',
      descriptors: { weight: '500' },
    },
    {
      family: 'Poppins',
      url: 'https://fonts.gstatic.com/s/poppins/v22/pxiByp8kv8JHgFVrLEj6Z1JlFd2JQEl8qw.woff2',
      descriptors: { weight: '600' },
    },
    {
      family: 'Poppins',
      url: 'https://fonts.gstatic.com/s/poppins/v22/pxiByp8kv8JHgFVrLCz7Z1JlFd2JQEl8qw.woff2',
      descriptors: { weight: '700' },
    },
  ];

  const promises = specs.map(({ family, url, descriptors }) => {
    const face = new FontFace(family, `url(${url})`, descriptors);
    return face.load().then((loaded) => {
      document.fonts.add(loaded);
    });
  });

  await Promise.all(promises);
  console.log('✅ Google Fonts loaded: Bebas Neue, Poppins (400–700)');
};

// ═══════════════════════════════════════════════════════
//  useStoryData — Fonts, CSV fetch, image processing
// ═══════════════════════════════════════════════════════
export function useStoryData() {
  const [storyData, setStoryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [colorTheme, setColorTheme] = useState(DEFAULT_THEME);
  const [loadedImage, setLoadedImage] = useState(null);
  const [smartcropRect, setSmartcropRect] = useState(null);
  const [activityLog, setActivityLog] = useState([]);

  // ── Load Google Fonts on mount ──
  useEffect(() => {
    loadGoogleFonts()
      .then(() => setFontsReady(true))
      .catch((err) => {
        console.warn('Font loading failed, falling back to system fonts:', err);
        setFontsReady(true);
      });
  }, []);

  // ── Activity log helper ──
  const logIdRef = useRef(0);
  const addLog = useCallback((msg) => {
    const time = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const id = Date.now() + (++logIdRef.current);
    setActivityLog((prev) => [{ id, time, msg }, ...prev].slice(0, 20));
  }, []);

  // ── Fetch latest story from Google Sheets ──
  const fetchLatestStory = useCallback(async () => {
    try {
      const response = await fetch(GOOGLE_SHEETS_CSV_URL);
      const csvText = await response.text();
      const Papa = (await import('papaparse')).default;
      return new Promise((resolve, reject) => {
        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const data = results.data;
            if (data.length > 0) {
              resolve(data[data.length - 1]);
            } else {
              reject(new Error('No data found'));
            }
          },
          error: () => reject(new Error('Failed to parse CSV')),
        });
      });
    } catch {
      throw new Error('Failed to fetch from Google Sheets');
    }
  }, []);

  // ── Initial data fetch ──
  useEffect(() => {
    fetchLatestStory()
      .then((data) => {
        setStoryData(data);
        setLoading(false);
        const hl = data['Headline'] || '';
        addLog(`Loaded story: "${hl}"`);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [fetchLatestStory, addLog]);

  // ── Image loading + processing (smartcrop + ColorThief) ──
  useEffect(() => {
    if (!storyData || !fontsReady) return;

    let cancelled = false;

    (async () => {
      try {
        const img = await loadImageForRendering(storyData['Image URL']);
        if (cancelled) return;

        let cropRect = null;
        try {
          const smartcrop = (await import('smartcrop')).default;
          const result = await smartcrop.crop(img, {
            width: 1080,
            height: 1920,
            minScale: 1.0,
          });
          cropRect = result.topCrop;
          if (!cancelled) {
            setSmartcropRect(cropRect);
          }
          console.log('✅ smartcrop:', cropRect);
        } catch (e) {
          console.warn('smartcrop failed, using center-crop fallback:', e);
        }

        if (!cancelled) {
          setLoadedImage(img);
        }

        let theme = DEFAULT_THEME;
        try {
          const ColorThief = (await import('colorthief')).default;
          const colorThief = new ColorThief();
          const dominant = colorThief.getColor(img);
          const palette = colorThief.getPalette(img, 6);
          theme = createTheme(dominant, palette);
          if (!cancelled) {
            setColorTheme(theme);
          }
          console.log('✅ Color palette extracted');
        } catch (e) {
          console.warn('Color Thief failed, using default theme:', e);
        }
      } catch (e) {
        console.error('Failed to load the background image:', e?.message || e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [storyData, fontsReady]);

  return {
    storyData,
    setStoryData,
    loading,
    error,
    fontsReady,
    colorTheme,
    loadedImage,
    smartcropRect,
    activityLog,
    addLog,
    fetchLatestStory,
  };
}
