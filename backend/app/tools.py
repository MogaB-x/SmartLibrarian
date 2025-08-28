import json
import os


FULL_SUMMARY_PATH = os.path.join(os.path.dirname(__file__), "../data/full_book.json")


def get_summary_by_title(title: str) -> str:
    try:
        with open(FULL_SUMMARY_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get(title, "Book summary not available.")
    except Exception as e:
        return f"Error accessing full summary: {e}"
