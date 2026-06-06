import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from engine.collaborative import calculate_cf_scores


def test_empty_ratings():
    scores = calculate_cf_scores(1, [], [1, 2, 3])
    assert all(v == 0.0 for v in scores.values())


def test_target_user_not_in_ratings():
    ratings = [{"user_id": 2, "movie_id": 1, "score": 4.0}]
    scores = calculate_cf_scores(999, ratings, [1])
    assert scores[1] == 0.0


def test_scores_between_0_and_1():
    ratings = [
        {"user_id": 1, "movie_id": 1, "score": 5.0},
        {"user_id": 1, "movie_id": 2, "score": 3.0},
        {"user_id": 2, "movie_id": 1, "score": 4.0},
        {"user_id": 2, "movie_id": 3, "score": 5.0},
    ]
    scores = calculate_cf_scores(1, ratings, [3])
    assert 0.0 <= scores[3] <= 1.0


def test_unknown_movie_returns_zero():
    ratings = [{"user_id": 1, "movie_id": 1, "score": 4.0}]
    scores = calculate_cf_scores(1, ratings, [9999])
    assert scores[9999] == 0.0
