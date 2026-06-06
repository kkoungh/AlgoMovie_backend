require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const axios = require('axios');
const pool  = require('../config/database');

const TMDB_BASE  = process.env.TMDB_BASE_URL  || 'https://api.themoviedb.org/3';
const TMDB_KEY   = process.env.TMDB_API_KEY;
const TARGET     = 1000;

if (!TMDB_KEY) {
  console.error('TMDB_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.');
  process.exit(1);
}

const fetchPage = async (page) => {
  const res = await axios.get(`${TMDB_BASE}/movie/popular`, {
    params: { api_key: TMDB_KEY, language: 'ko-KR', page },
  });
  return res.data.results;
};

const upsertMovie = async (movie) => {
  const genres  = movie.genre_ids.map((id) => genreIdToName(id)).filter(Boolean);
  const country = (movie.origin_country && movie.origin_country[0]) || 'US';
  await pool.query(
    `INSERT INTO movies (tmdb_id, title, genres, overview, poster_path, release_year, origin_country)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
     ON CONFLICT (tmdb_id) DO UPDATE SET origin_country = EXCLUDED.origin_country`,
    [
      movie.id,
      movie.title,
      JSON.stringify(genres),
      movie.overview || null,
      movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
      movie.release_date ? parseInt(movie.release_date.slice(0, 4)) : null,
      country,
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
  let total = 0;
  let page  = 1;

  console.log(`TMDB에서 영화 데이터 수집 시작 (목표: ${TARGET}개)`);

  while (total < TARGET) {
    try {
      const movies = await fetchPage(page);
      if (!movies || movies.length === 0) break;

      for (const m of movies) {
        await upsertMovie(m);
        total++;
        if (total >= TARGET) break;
      }

      console.log(`${total}개 수집 완료 (페이지 ${page})`);
      page++;
      await new Promise((r) => setTimeout(r, 300)); // Rate limit
    } catch (err) {
      console.error(`페이지 ${page} 오류:`, err.message);
      break;
    }
  }

  console.log(`수집 완료: 총 ${total}개`);
  await pool.end();
};

run();
