import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from engine.hybrid import classify_user_segment, generate_top30


def test_classify_new_user():
    a, b, g = classify_user_segment(0)
    assert (a, b, g) == (0.0, 0.5, 0.5)

def test_classify_early_user():
    a, b, g = classify_user_segment(5)
    assert (a, b, g) == (0.5, 0.5, 0.0)

def test_classify_active_user():
    a, b, g = classify_user_segment(20)
    assert (a, b, g) == (0.7, 0.3, 0.0)

def test_classify_boundary_19():
    a, b, g = classify_user_segment(19)
    assert (a, b, g) == (0.5, 0.5, 0.0)


def make_movies(n=5):
    return [{"movie_id": i, "title": f"영화{i}", "genres": ["Action"],
             "poster_path": None, "avg_rating": 4.0, "rating_count": 50} for i in range(1, n + 1)]


def test_empty_candidates():
    result = generate_top30(1, 5, ["Action"], [], [], set(), set())
    assert result == []


def test_negative_feedback_excluded():
    movies = make_movies(3)
    result = generate_top30(
        user_id=1, rating_count=0,
        preferred_genres=["Action"], all_ratings=[],
        candidate_movies=movies,
        negative_movie_ids={1, 2},
        rated_movie_ids=set(),
    )
    ids = [r["movie_id"] for r in result]
    assert 1 not in ids
    assert 2 not in ids


def test_rated_movies_excluded():
    movies = make_movies(3)
    result = generate_top30(
        user_id=1, rating_count=0,
        preferred_genres=["Action"], all_ratings=[],
        candidate_movies=movies,
        negative_movie_ids=set(),
        rated_movie_ids={1},
    )
    ids = [r["movie_id"] for r in result]
    assert 1 not in ids


def test_returns_at_most_30():
    movies = make_movies(50)
    result = generate_top30(
        user_id=1, rating_count=0,
        preferred_genres=["Action"], all_ratings=[],
        candidate_movies=movies,
        negative_movie_ids=set(), rated_movie_ids=set(),
    )
    assert len(result) <= 30


def test_result_sorted_by_final_score():
    movies = make_movies(5)
    result = generate_top30(
        user_id=1, rating_count=5,
        preferred_genres=["Action"], all_ratings=[],
        candidate_movies=movies,
        negative_movie_ids=set(), rated_movie_ids=set(),
    )
    scores = [r["final_score"] for r in result]
    assert scores == sorted(scores, reverse=True)
