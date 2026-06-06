import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from engine.popularity import calculate_popularity_scores


def test_empty_list():
    assert calculate_popularity_scores([]) == {}


def test_single_movie_max_values():
    movies = [{"movie_id": 1, "avg_rating": 5.0, "rating_count": 100}]
    scores = calculate_popularity_scores(movies)
    assert scores[1] == round(1.0 * 0.7 + 1.0 * 0.3, 6)


def test_zero_rating():
    movies = [{"movie_id": 2, "avg_rating": 0, "rating_count": 0}]
    scores = calculate_popularity_scores(movies)
    assert scores[2] == 0.0


def test_rating_count_capped_at_100():
    movies_low  = [{"movie_id": 1, "avg_rating": 4.0, "rating_count": 100}]
    movies_high = [{"movie_id": 1, "avg_rating": 4.0, "rating_count": 9999}]
    assert calculate_popularity_scores(movies_low)[1] == calculate_popularity_scores(movies_high)[1]


def test_multiple_movies_ordering():
    movies = [
        {"movie_id": 1, "avg_rating": 5.0, "rating_count": 100},
        {"movie_id": 2, "avg_rating": 1.0, "rating_count": 0},
    ]
    scores = calculate_popularity_scores(movies)
    assert scores[1] > scores[2]
