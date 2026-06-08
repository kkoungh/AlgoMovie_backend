require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const axios = require('axios');
const pool  = require('../config/database');

const TMDB_BASE = process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3';
const TMDB_KEY  = process.env.TMDB_API_KEY;

if (!TMDB_KEY) {
  console.error('TMDB_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.');
  process.exit(1);
}

// 국가별 수집 목표 (합계 ~1500)
const COUNTRY_TARGETS = [
  { country: 'KR', target: 400 },
  { country: 'JP', target: 300 },
  { country: 'US', target: 300 },
  { country: 'IN', target: 200 },
  { country: 'FR', target: 150 },
  { country: 'GB', target: 150 },
];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const fetchByCountry = async (country, page) => {
  const res = await axios.get(`${TMDB_BASE}/discover/movie`, {
    params: {
      api_key:             TMDB_KEY,
      language:            'ko-KR',
      with_origin_country: country,
      sort_by:             'popularity.desc',
      page,
    },
  });
  return res.data.results || [];
};

const fetchCredits = async (tmdbId) => {
  try {
    const res = await axios.get(`${TMDB_BASE}/movie/${tmdbId}/credits`, {
      params: { api_key: TMDB_KEY },
    });
    const director = (res.data.crew || []).find((c) => c.job === 'Director')?.name || null;
    const cast     = (res.data.cast || []).slice(0, 5).map((c) => c.name);
    return { director, cast };
  } catch (_) {
    return { director: null, cast: [] };
  }
};

const upsertMovie = async (movie, director, cast) => {
  const genres  = (movie.genre_ids || []).map((id) => genreIdToName(id)).filter(Boolean);
  const country = (movie.origin_country && movie.origin_country[0]) || 'US';
  await pool.query(
    `INSERT INTO movies
       (tmdb_id, title, genres, overview, poster_path, release_year, origin_country, director, cast_members)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9::jsonb)
     ON CONFLICT (tmdb_id) DO UPDATE SET
       origin_country = EXCLUDED.origin_country,
       director       = EXCLUDED.director,
       cast_members   = EXCLUDED.cast_members`,
    [
      movie.id,
      movie.title,
      JSON.stringify(genres),
      movie.overview || null,
      movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
      movie.release_date ? parseInt(movie.release_date.slice(0, 4)) : null,
      country,
      director,
      JSON.stringify(cast),
    ]
  );
};

const genreIdToName = (id) => {
  const map = {
    28: 'Action', 35: 'Comedy', 18: 'Drama', 27: 'Horror',
    10749: 'Romance', 878: 'Sci-Fi', 53: 'Thriller', 16: 'Animation',
    99: 'Documentary', 14: 'Fantasy', 80: 'Crime', 12: 'Adventure',
    9648: 'Mystery', 10751: 'Family', 36: 'History',
  };
  return map[id] || null;
};

const run = async () => {
  let grandTotal = 0;

  for (const { country, target } of COUNTRY_TARGETS) {
    let countryTotal = 0;
    let page = 1;
    console.log(`\n[${country}] 수집 시작 (목표: ${target}개)`);

    while (countryTotal < target) {
      try {
        const movies = await fetchByCountry(country, page);
        if (movies.length === 0) break;

        for (const m of movies) {
          const { director, cast } = await fetchCredits(m.id);
          await upsertMovie(m, director, cast);
          countryTotal++;
          grandTotal++;
          if (countryTotal >= target) break;
          await delay(250);
        }

        console.log(`[${country}] ${countryTotal}개 완료 (페이지 ${page})`);
        page++;
        await delay(300);
      } catch (err) {
        console.error(`[${country}] 페이지 ${page} 오류:`, err.message);
        break;
      }
    }

    console.log(`[${country}] 완료: ${countryTotal}개`);
  }

  console.log(`\n수집 완료: 총 ${grandTotal}개`);
  await pool.end();
};

run();
