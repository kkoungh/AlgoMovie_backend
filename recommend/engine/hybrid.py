from engine.collaborative  import calculate_cf_scores
from engine.content_based  import calculate_content_scores
from engine.popularity     import calculate_popularity_scores


def classify_user_segment(rating_count: int) -> tuple[float, float, float]:
    """
    사용자 세그먼트별 가중치 반환 (α, β, γ).
    신규  (0~4):    α=0.0, β=0.5, γ=0.5
    초기  (5~19):   α=0.5, β=0.5, γ=0.0
    활성  (20+):    α=0.7, β=0.3, γ=0.0
    """
    if rating_count >= 20:
        return 0.7, 0.3, 0.0
    elif rating_count >= 5:
        return 0.5, 0.5, 0.0
    else:
        return 0.0, 0.5, 0.5


def generate_top30(
    user_id: int,
    rating_count: int,
    preferred_genres: list[str],
    all_ratings: list[dict],
    candidate_movies: list[dict],
    negative_movie_ids: set[int],
    rated_movie_ids: set[int],
) -> list[dict]:
    """
    하이브리드 추천 알고리즘 실행.
    Final_Score = α × CF_score + β × Content_score + γ × Popularity_score
    """
    alpha, beta, gamma = classify_user_segment(rating_count)

    # 후보 영화에서 부정 피드백 영화 및 이미 평가한 영화 제외
    candidates = [
        m for m in candidate_movies
        if m["movie_id"] not in negative_movie_ids
        and m["movie_id"] not in rated_movie_ids
    ]

    if not candidates:
        return []

    candidate_ids = [m["movie_id"] for m in candidates]

    # 각 점수 계산
    cf_scores      = calculate_cf_scores(user_id, all_ratings, candidate_ids) if alpha > 0 else {mid: 0.0 for mid in candidate_ids}
    content_scores = calculate_content_scores(candidates, preferred_genres)   if beta  > 0 else {mid: 0.0 for mid in candidate_ids}
    pop_scores     = calculate_popularity_scores(candidates)                   if gamma > 0 else {mid: 0.0 for mid in candidate_ids}

    # 최종 점수 계산
    results = []
    for m in candidates:
        mid = m["movie_id"]
        cf  = cf_scores.get(mid, 0.0)
        cb  = content_scores.get(mid, 0.0)
        pop = pop_scores.get(mid, 0.0)
        final = round(alpha * cf + beta * cb + gamma * pop, 6)

        results.append({
            "movie_id":        mid,
            "title":           m.get("title", ""),
            "poster_path":     m.get("poster_path"),
            "avg_rating":      float(m.get("avg_rating") or 0),
            "genres":          m.get("genres") or [],
            "final_score":     final,
            "cf_score":        cf,
            "content_score":   cb,
            "popularity_score": pop,
        })

    # 최종 점수 내림차순 정렬 → 상위 30개
    results.sort(key=lambda x: x["final_score"], reverse=True)
    return results[:30]
