-- AlgoMovie Database Schema
-- PostgreSQL

-- 장르 테이블
CREATE TABLE IF NOT EXISTS genres (
  genre_id SERIAL PRIMARY KEY,
  name     VARCHAR(50) UNIQUE NOT NULL
);

-- 사용자 테이블
CREATE TABLE IF NOT EXISTS users (
  user_id           BIGSERIAL    PRIMARY KEY,
  email             VARCHAR(255) UNIQUE NOT NULL,
  nickname          VARCHAR(50)  NOT NULL,
  password_hash     VARCHAR(255) NOT NULL,
  profile_image_url VARCHAR(500),
  rating_count      INT          NOT NULL DEFAULT 0,
  status            VARCHAR(10)  NOT NULL DEFAULT 'ACTIVE',
  created_at        TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- 사용자 선호 장르
CREATE TABLE IF NOT EXISTS user_preferred_genres (
  user_id  BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  genre_id INT    NOT NULL REFERENCES genres(genre_id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, genre_id)
);

-- 영화 테이블
CREATE TABLE IF NOT EXISTS movies (
  movie_id     BIGSERIAL    PRIMARY KEY,
  tmdb_id      INT          UNIQUE NOT NULL,
  title        VARCHAR(300) NOT NULL,
  genres       JSONB        NOT NULL DEFAULT '[]',
  director     VARCHAR(200),
  cast_members JSONB        DEFAULT '[]',
  overview     TEXT,
  poster_path     VARCHAR(500),
  release_year    INT,
  origin_country  VARCHAR(10),
  avg_rating      FLOAT        NOT NULL DEFAULT 0.0,
  rating_count INT          NOT NULL DEFAULT 0,
  created_at   TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- 평점/리뷰 테이블
CREATE TABLE IF NOT EXISTS ratings (
  rating_id  BIGSERIAL PRIMARY KEY,
  user_id    BIGINT    NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  movie_id   BIGINT    NOT NULL REFERENCES movies(movie_id) ON DELETE CASCADE,
  score      FLOAT     NOT NULL CHECK (score >= 1 AND score <= 5),
  review     TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, movie_id)
);

-- 추천 피드백 테이블 (feedback_type: 0=DISLIKE, 1=LIKE, 2=REMOVE)
CREATE TABLE IF NOT EXISTS feedback (
  feedback_id   BIGSERIAL  PRIMARY KEY,
  user_id       BIGINT     NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  movie_id      BIGINT     NOT NULL REFERENCES movies(movie_id) ON DELETE CASCADE,
  feedback_type SMALLINT   NOT NULL CHECK (feedback_type IN (0, 1, 2)),
  created_at    TIMESTAMP  NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, movie_id)
);

-- 위시리스트 테이블
CREATE TABLE IF NOT EXISTS wishlist (
  wishlist_id BIGSERIAL PRIMARY KEY,
  user_id     BIGINT    NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  movie_id    BIGINT    NOT NULL REFERENCES movies(movie_id) ON DELETE CASCADE,
  added_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, movie_id)
);

-- 조회 이력 테이블
CREATE TABLE IF NOT EXISTS view_history (
  history_id BIGSERIAL PRIMARY KEY,
  user_id    BIGINT    NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  movie_id   BIGINT    NOT NULL REFERENCES movies(movie_id) ON DELETE CASCADE,
  viewed_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, movie_id)
);

-- 추천 점수 테이블 (Source of Truth)
CREATE TABLE IF NOT EXISTS recommend_scores (
  score_id         BIGSERIAL PRIMARY KEY,
  user_id          BIGINT    NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  movie_id         BIGINT    NOT NULL REFERENCES movies(movie_id) ON DELETE CASCADE,
  cf_score         FLOAT     NOT NULL DEFAULT 0.0,
  content_score    FLOAT     NOT NULL DEFAULT 0.0,
  popularity_score FLOAT     NOT NULL DEFAULT 0.0,
  final_score      FLOAT     NOT NULL DEFAULT 0.0,
  calculated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, movie_id)
);

-- Refresh Token 테이블
CREATE TABLE IF NOT EXISTS refresh_tokens (
  token_id   BIGSERIAL    PRIMARY KEY,
  user_id    BIGINT       NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP    NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_ratings_user_id        ON ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_ratings_movie_id       ON ratings(movie_id);
CREATE INDEX IF NOT EXISTS idx_recommend_user_id      ON recommend_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_recommend_final_score  ON recommend_scores(final_score DESC);
CREATE INDEX IF NOT EXISTS idx_movies_tmdb_id         ON movies(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_movies_release_year    ON movies(release_year);
CREATE INDEX IF NOT EXISTS idx_movies_avg_rating      ON movies(avg_rating DESC);
CREATE INDEX IF NOT EXISTS idx_view_history_user      ON view_history(user_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_wishlist_user          ON wishlist(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_user          ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user    ON refresh_tokens(user_id);

-- 기본 장르 데이터
INSERT INTO genres (name) VALUES
  ('Action'),
  ('Comedy'),
  ('Drama'),
  ('Horror'),
  ('Romance'),
  ('Sci-Fi'),
  ('Thriller'),
  ('Animation'),
  ('Documentary'),
  ('Fantasy'),
  ('Crime'),
  ('Adventure'),
  ('Mystery'),
  ('Family'),
  ('History')
ON CONFLICT (name) DO NOTHING;
