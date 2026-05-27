import numpy as np


def calculate_popularity_scores(movies: list[dict]) -> dict[int, float]:
    """
    인기도 점수 계산.
    공식: (avg_rating / 5.0) * 0.7 + min(rating_count / 100, 1.0) * 0.3
    반환: {movie_id: popularity_score}
    """
    scores = {}
    for m in movies:
        avg    = float(m.get("avg_rating") or 0)
        count  = int(m.get("rating_count") or 0)
        score  = (avg / 5.0) * 0.7 + min(count / 100.0, 1.0) * 0.3
        scores[m["movie_id"]] = round(score, 6)
    return scores
