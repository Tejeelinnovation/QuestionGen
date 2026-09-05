"""
URL configuration for the content app.

Mounted at /api/ in the root urls.py so paths resolve as:
    /api/books/
    /api/chapters/
    /api/topics/
    /api/questions/
"""

from django.urls import path

from .views import BookListView, ChapterListView, QuestionListView, TopicListView

urlpatterns = [
    path("books/",     BookListView.as_view(),    name="book-list"),
    path("chapters/",  ChapterListView.as_view(), name="chapter-list"),
    path("topics/",    TopicListView.as_view(),   name="topic-list"),
    path("questions/", QuestionListView.as_view(), name="question-list"),
]
