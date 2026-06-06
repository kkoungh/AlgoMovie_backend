import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from engine import hybrid
from engine.collaborative import calculate_cf_scores
from engine.content_based import calculate_content_scores
from engine.popularity import calculate_popularity_scores


def sample_movies(count=35):
    return [
        {
            "movie_id": i,
            "title": f"Movie {i}",
            "genres": ["Action"] if i % 2 == 0 else ["Drama"],
            "poster_path": f"/{i}.png",
            "avg_rating": 5 - (i % 5) * 0.5,
            "rating_count": 100 - i,
        }
        for i in range(1, count + 1)
    ]


def test_user_segments_return_required_weights():
    assert hybrid.classify_user_segment(0) == (0.0, 0.5, 0.5)
    assert hybrid.classify_user_segment(4) == (0.0, 0.5, 0.5)
    assert hybrid.classify_user_segment(5) == (0.5, 0.5, 0.0)
    assert hybrid.classify_user_segment(19) == (0.5, 0.5, 0.0)
    assert hybrid.classify_user_segment(20) == (0.7, 0.3, 0.0)


def test_final_score_formula_for_new_user(monkeypatch):
    movies = sample_movies(2)
    monkeypatch.setattr(hybrid, "calculate_cf_scores", lambda *args: {1: 1.0, 2: 0.0})
    monkeypatch.setattr(hybrid, "calculate_content_scores", lambda *args: {1: 0.8, 2: 0.2})
    monkeypatch.setattr(hybrid, "calculate_popularity_scores", lambda *args: {1: 0.2, 2: 1.0})

    recs = hybrid.generate_top30(
        user_id=7,
        rating_count=0,
        preferred_genres=["Action"],
        all_ratings=[],
        candidate_movies=movies,
        negative_movie_ids=set(),
        rated_movie_ids=set(),
    )

    assert recs[0]["movie_id"] == 2
    assert recs[0]["final_score"] == 0.6
    assert recs[1]["final_score"] == 0.5


def test_final_score_formula_for_5_to_19_ratings_user(monkeypatch):
    movies = sample_movies(1)
    monkeypatch.setattr(hybrid, "calculate_cf_scores", lambda *args: {1: 0.6})
    monkeypatch.setattr(hybrid, "calculate_content_scores", lambda *args: {1: 0.8})
    monkeypatch.setattr(hybrid, "calculate_popularity_scores", lambda *args: {1: 1.0})

    recs = hybrid.generate_top30(7, 5, ["Action"], [], movies, set(), set())

    assert recs[0]["final_score"] == 0.7
    assert recs[0]["popularity_score"] == 0.0


def test_final_score_formula_for_20_plus_ratings_user(monkeypatch):
    movies = sample_movies(1)
    monkeypatch.setattr(hybrid, "calculate_cf_scores", lambda *args: {1: 0.6})
    monkeypatch.setattr(hybrid, "calculate_content_scores", lambda *args: {1: 0.8})
    monkeypatch.setattr(hybrid, "calculate_popularity_scores", lambda *args: {1: 1.0})

    recs = hybrid.generate_top30(7, 20, ["Action"], [], movies, set(), set())

    assert recs[0]["final_score"] == 0.66
    assert recs[0]["popularity_score"] == 0.0


def test_scores_are_normalized_between_zero_and_one():
    movies = sample_movies(3)
    all_ratings = [
        {"user_id": 7, "movie_id": 1, "score": 5},
        {"user_id": 7, "movie_id": 2, "score": 1},
        {"user_id": 8, "movie_id": 1, "score": 5},
        {"user_id": 8, "movie_id": 3, "score": 4},
    ]

    score_sets = [
        calculate_cf_scores(7, all_ratings, [1, 2, 3]),
        calculate_content_scores(movies, ["Action"]),
        calculate_popularity_scores(movies),
    ]

    for scores in score_sets:
        assert scores
        assert all(0 <= score <= 1 for score in scores.values())


def test_generate_top30_sorts_by_final_score_and_limits_to_30(monkeypatch):
    movies = sample_movies(35)
    monkeypatch.setattr(hybrid, "calculate_cf_scores", lambda *args: {m["movie_id"]: m["movie_id"] / 35 for m in movies})
    monkeypatch.setattr(hybrid, "calculate_content_scores", lambda *args: {m["movie_id"]: 0.0 for m in movies})
    monkeypatch.setattr(hybrid, "calculate_popularity_scores", lambda *args: {m["movie_id"]: 0.0 for m in movies})

    recs = hybrid.generate_top30(7, 20, ["Action"], [], movies, set(), set())

    assert len(recs) == 30
    assert recs[0]["movie_id"] == 35
    assert recs[-1]["movie_id"] == 6
    assert recs == sorted(recs, key=lambda r: r["final_score"], reverse=True)


def test_negative_and_rated_movies_are_excluded_from_candidates(monkeypatch):
    movies = sample_movies(5)
    monkeypatch.setattr(hybrid, "calculate_cf_scores", lambda *args: {m["movie_id"]: 0.5 for m in movies})
    monkeypatch.setattr(hybrid, "calculate_content_scores", lambda *args: {m["movie_id"]: 0.5 for m in movies})
    monkeypatch.setattr(hybrid, "calculate_popularity_scores", lambda *args: {m["movie_id"]: 0.5 for m in movies})

    recs = hybrid.generate_top30(
        user_id=7,
        rating_count=20,
        preferred_genres=["Action"],
        all_ratings=[],
        candidate_movies=movies,
        negative_movie_ids={2},
        rated_movie_ids={3},
    )

    returned_ids = {rec["movie_id"] for rec in recs}
    assert 2 not in returned_ids
    assert 3 not in returned_ids
    assert returned_ids == {1, 4, 5}
