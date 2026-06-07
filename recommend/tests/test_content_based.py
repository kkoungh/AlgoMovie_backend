import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from engine.content_based import calculate_content_scores


def test_empty_movies():
    assert calculate_content_scores([], ['Action']) == {}


def test_empty_preferred_genres():
    movies = [{"movie_id": 1, "genres": ["Action"]}]
    scores = calculate_content_scores(movies, [])
    assert scores[1] == 0.0


def test_perfect_match():
    movies = [{"movie_id": 1, "genres": ["Action"]}]
    scores = calculate_content_scores(movies, ["Action"])
    assert scores[1] == 1.0


def test_no_match():
    movies = [{"movie_id": 1, "genres": ["Horror"]}]
    scores = calculate_content_scores(movies, ["Comedy"])
    assert scores[1] == 0.0


def test_partial_match_lower_than_full():
    movies = [
        {"movie_id": 1, "genres": ["Action", "Comedy"]},
        {"movie_id": 2, "genres": ["Action"]},
    ]
    scores = calculate_content_scores(movies, ["Action"])
    assert scores[2] >= scores[1]


def test_multiple_movies():
    movies = [
        {"movie_id": 1, "genres": ["Action", "Thriller"]},
        {"movie_id": 2, "genres": ["Comedy"]},
    ]
    scores = calculate_content_scores(movies, ["Action", "Thriller"])
    assert scores[1] > scores[2]
