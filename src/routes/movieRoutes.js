const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const pool = require('../config/database');

/**
 * @route POST /api/movies
 * @desc 새로운 영화 등록 (이미지 업로드 포함)
 */
router.post('/movies', upload.single('poster'), async (req, res, next) => {
  try {
    const { title, genres, overview, release_year, origin_country, tmdb_id } = req.body;
    
    // 클라이언트에서 접근할 수 있는 상대 경로 저장
    const posterPath = req.file ? `/uploads/posters/${req.file.filename}` : null;

    const query = `
      INSERT INTO movies (tmdb_id, title, genres, overview, poster_path, release_year, origin_country)
      VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const values = [
      tmdb_id || null, // 직접 등록 시 TMDB ID가 없을 수 있으므로 처리
      title,
      genres ? (typeof genres === 'string' ? genres : JSON.stringify(genres)) : '[]',
      overview || null,
      posterPath,
      release_year ? parseInt(release_year) : null,
      origin_country || 'US'
    ];

    const result = await pool.query(query, values);
    res.status(201).json({ success: true, movie: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;