import numpy as np
from sklearn.preprocessing import MultiLabelBinarizer
from sklearn.metrics.pairwise import cosine_similarity


def calculate_content_scores(
    movies: list[dict],
    preferred_genres: list[str],
) -> dict[int, float]:
    """
    콘텐츠 기반 필터링 점수 계산.
    - 영화 장르 벡터 + 사용자 선호 장르 벡터 간 코사인 유사도
    반환: {movie_id: content_score}
    """
    if not movies:
        return {}

    # 영화별 장르 리스트 추출
    movie_ids = [m["movie_id"] for m in movies]
    genre_lists = []
    for m in movies:
        g = m.get("genres") or []
        if isinstance(g, str):
            import json
            try:
                g = json.loads(g)
            except Exception:
                g = []
        genre_lists.append(g)

    # 모든 장르 집합
    all_genres = set(preferred_genres)
    for gl in genre_lists:
        all_genres.update(gl)
    all_genres = sorted(all_genres)

    if not all_genres:
        return {mid: 0.0 for mid in movie_ids}

    mlb = MultiLabelBinarizer(classes=all_genres)
    mlb.fit([all_genres])

    # 영화 벡터 행렬
    movie_vecs = mlb.transform(genre_lists).astype(float)

    # 사용자 선호 장르 벡터
    user_vec = mlb.transform([preferred_genres]).astype(float)

    if user_vec.sum() == 0:
        return {mid: 0.0 for mid in movie_ids}

    # 코사인 유사도
    sims = cosine_similarity(user_vec, movie_vecs)[0]

    scores = {}
    for i, mid in enumerate(movie_ids):
        scores[mid] = round(float(sims[i]), 6)

    return scores
