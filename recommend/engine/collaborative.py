import numpy as np
from sklearn.metrics.pairwise import cosine_similarity


def calculate_cf_scores(
    target_user_id: int,
    all_ratings: list[dict],
    candidate_movie_ids: list[int],
) -> dict[int, float]:
    """
    협업 필터링 점수 계산 (User-based CF).
    - 모든 사용자의 평점 행렬 구성
    - 타겟 유저와 다른 유저 간 코사인 유사도 계산
    - 유사 유저가 높게 평가한 영화를 후보 점수로 반환
    반환: {movie_id: cf_score}
    """
    if not all_ratings:
        return {mid: 0.0 for mid in candidate_movie_ids}

    # 사용자-영화 평점 행렬 구성
    user_ids  = sorted(set(r["user_id"]  for r in all_ratings))
    movie_ids = sorted(set(r["movie_id"] for r in all_ratings))

    if target_user_id not in user_ids:
        return {mid: 0.0 for mid in candidate_movie_ids}

    uid_idx = {uid: i for i, uid in enumerate(user_ids)}
    mid_idx = {mid: i for i, mid in enumerate(movie_ids)}

    matrix = np.zeros((len(user_ids), len(movie_ids)), dtype=float)
    for r in all_ratings:
        ui = uid_idx[r["user_id"]]
        mi = mid_idx[r["movie_id"]]
        matrix[ui][mi] = float(r["score"])

    target_idx = uid_idx[target_user_id]
    target_vec = matrix[target_idx].reshape(1, -1)

    if target_vec.sum() == 0:
        return {mid: 0.0 for mid in candidate_movie_ids}

    # 모든 유저와 유사도 계산
    sims = cosine_similarity(target_vec, matrix)[0]
    sims[target_idx] = 0.0  # 자기 자신 제외

    # 상위 유사 유저 20명으로 예측 점수 계산
    top_k = min(20, len(user_ids) - 1)
    top_indices = np.argsort(sims)[::-1][:top_k]

    scores = {}
    for mid in candidate_movie_ids:
        if mid not in mid_idx:
            scores[mid] = 0.0
            continue

        mi = mid_idx[mid]
        numerator   = sum(sims[ui] * matrix[ui][mi] for ui in top_indices if matrix[ui][mi] > 0)
        denominator = sum(abs(sims[ui]) for ui in top_indices if matrix[ui][mi] > 0)
        pred = (numerator / denominator / 5.0) if denominator > 0 else 0.0
        scores[mid] = round(min(max(float(pred), 0.0), 1.0), 6)

    return scores
