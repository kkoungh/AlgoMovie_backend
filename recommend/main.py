import json
from fastapi import FastAPI, HTTPException, BackgroundTasks
from database import get_connection
from engine.hybrid import generate_top_n

SHOWN_COUNT = 30
SPARE_COUNT = 20

app = FastAPI(title="AlgoMovie Recommendation Engine", version="1.0.0")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/recommendations/{user_id}")
def get_recommendations(user_id: int):
    try:
        conn = get_connection()
        cur  = conn.cursor()

        # 사용자 정보 조회
        cur.execute(
            "SELECT rating_count FROM users WHERE user_id = %s AND status = 'ACTIVE'",
            (user_id,)
        )
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")

        rating_count = user["rating_count"]

        # 사용자 선호 장르
        cur.execute(
            """SELECT g.name FROM user_preferred_genres upg
               JOIN genres g ON upg.genre_id = g.genre_id
               WHERE upg.user_id = %s""",
            (user_id,)
        )
        preferred_genres = [r["name"] for r in cur.fetchall()]

        # 사용자 평점 데이터
        cur.execute(
            "SELECT user_id, movie_id, score FROM ratings",
        )
        all_ratings = [dict(r) for r in cur.fetchall()]

        # 부정 피드백 영화 (DISLIKE=0, REMOVE=2)
        cur.execute(
            "SELECT movie_id FROM feedback WHERE user_id = %s AND feedback_type IN (0, 2)",
            (user_id,)
        )
        negative_ids = {r["movie_id"] for r in cur.fetchall()}

        # 이미 평가한 영화
        cur.execute("SELECT movie_id FROM ratings WHERE user_id = %s", (user_id,))
        rated_ids = {r["movie_id"] for r in cur.fetchall()}

        # 후보 영화 (상위 500개, avg_rating 기준)
        cur.execute(
            """SELECT movie_id, title, genres, poster_path, avg_rating, rating_count
               FROM movies ORDER BY avg_rating DESC, rating_count DESC LIMIT 500"""
        )
        raw_movies = cur.fetchall()
        candidates = []
        for m in raw_movies:
            md = dict(m)
            g  = md.get("genres")
            if isinstance(g, str):
                try:
                    md["genres"] = json.loads(g)
                except Exception:
                    md["genres"] = []
            candidates.append(md)

        # 하이브리드 알고리즘 실행 (표시용 30 + 예비 후보 20 = 50개)
        top_n = generate_top_n(
            user_id=user_id,
            rating_count=rating_count,
            preferred_genres=preferred_genres,
            all_ratings=all_ratings,
            candidate_movies=candidates,
            negative_movie_ids=negative_ids,
            rated_movie_ids=rated_ids,
            n=SHOWN_COUNT + SPARE_COUNT,
        )

        cur.close()
        conn.close()
        return {
            "user_id":        user_id,
            "recommendations": top_n[:SHOWN_COUNT],
            "spare_pool":      top_n[SHOWN_COUNT:],
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/recommendations/update/{user_id}")
def trigger_update(user_id: int, background_tasks: BackgroundTasks):
    """평점 저장 후 Node.js가 호출하는 비동기 재계산 트리거."""
    background_tasks.add_task(_update_scores, user_id)
    return {"message": "추천 재계산이 백그라운드에서 시작되었습니다."}


def _update_scores(user_id: int):
    try:
        conn = get_connection()
        cur  = conn.cursor()

        cur.execute(
            "SELECT rating_count FROM users WHERE user_id = %s AND status = 'ACTIVE'",
            (user_id,)
        )
        user = cur.fetchone()
        if not user:
            return

        rating_count = user["rating_count"]

        cur.execute(
            """SELECT g.name FROM user_preferred_genres upg
               JOIN genres g ON upg.genre_id = g.genre_id
               WHERE upg.user_id = %s""",
            (user_id,)
        )
        preferred_genres = [r["name"] for r in cur.fetchall()]

        cur.execute("SELECT user_id, movie_id, score FROM ratings")
        all_ratings = [dict(r) for r in cur.fetchall()]

        cur.execute(
            "SELECT movie_id FROM feedback WHERE user_id = %s AND feedback_type IN (0, 2)",
            (user_id,)
        )
        negative_ids = {r["movie_id"] for r in cur.fetchall()}

        cur.execute("SELECT movie_id FROM ratings WHERE user_id = %s", (user_id,))
        rated_ids = {r["movie_id"] for r in cur.fetchall()}

        cur.execute(
            """SELECT movie_id, title, genres, poster_path, avg_rating, rating_count
               FROM movies ORDER BY avg_rating DESC, rating_count DESC LIMIT 500"""
        )
        raw_movies = cur.fetchall()
        candidates = []
        for m in raw_movies:
            md = dict(m)
            g  = md.get("genres")
            if isinstance(g, str):
                try:
                    md["genres"] = json.loads(g)
                except Exception:
                    md["genres"] = []
            candidates.append(md)

        top_n = generate_top_n(
            user_id=user_id,
            rating_count=rating_count,
            preferred_genres=preferred_genres,
            all_ratings=all_ratings,
            candidate_movies=candidates,
            negative_movie_ids=negative_ids,
            rated_movie_ids=rated_ids,
            n=SHOWN_COUNT + SPARE_COUNT,
        )
        recommendations = top_n  # DB 저장용은 50개 전체 저장

        # recommend_scores 테이블 UPSERT
        for rec in recommendations:
            cur.execute(
                """INSERT INTO recommend_scores
                     (user_id, movie_id, cf_score, content_score, popularity_score, final_score, calculated_at)
                   VALUES (%s, %s, %s, %s, %s, %s, NOW())
                   ON CONFLICT (user_id, movie_id) DO UPDATE
                     SET cf_score         = EXCLUDED.cf_score,
                         content_score    = EXCLUDED.content_score,
                         popularity_score = EXCLUDED.popularity_score,
                         final_score      = EXCLUDED.final_score,
                         calculated_at    = NOW()""",
                (
                    user_id,
                    rec["movie_id"],
                    rec["cf_score"],
                    rec["content_score"],
                    rec["popularity_score"],
                    rec["final_score"],
                )
            )
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"추천 재계산 오류 (user_id={user_id}):", e)


@app.get("/movies/{movie_id}/similar")
def get_similar_movies(movie_id: int):
    try:
        conn = get_connection()
        cur  = conn.cursor()

        cur.execute("SELECT genres FROM movies WHERE movie_id = %s", (movie_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="영화를 찾을 수 없습니다.")

        genres = row["genres"] or []
        if isinstance(genres, str):
            try:
                genres = json.loads(genres)
            except Exception:
                genres = []

        if not genres:
            cur.execute(
                """SELECT movie_id, title, poster_path, avg_rating, genres
                   FROM movies WHERE movie_id != %s ORDER BY avg_rating DESC LIMIT 5""",
                (movie_id,)
            )
        else:
            cur.execute(
                """SELECT movie_id, title, poster_path, avg_rating, genres
                   FROM movies
                   WHERE movie_id != %s AND genres::text ILIKE %s
                   ORDER BY avg_rating DESC LIMIT 5""",
                (movie_id, f"%{genres[0]}%")
            )

        movies = [dict(m) for m in cur.fetchall()]
        cur.close()
        conn.close()
        return {"movies": movies}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
