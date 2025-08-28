import os
import re
import io
from typing import List, Dict
from dotenv import load_dotenv

import chromadb
from chromadb.utils import embedding_functions


load_dotenv()
CHROMA_PATH = os.getenv("CHROMA_PATH")
DATA_PATH = os.getenv("DATA_PATH")
EMBED_MODEL = os.getenv("EMBED_MODEL")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")


def parse_books(path):
    with io.open(path, "r", encoding="utf-8") as f:
        raw = f.read()
    raw = raw.replace("\r\n", "\n")
    parts = re.split(r"\n(?=##\s*Title:)", raw)
    books = []
    for part in parts:
        if not part.strip():
            continue
        m = re.match(r"##\s*Title:\s*(.+)\n(.*)", part.strip(), re.DOTALL)
        if not m:
            continue
        title, summary = m.groups()
        books.append({"title": title.strip(), "summary": summary.strip()})
    return books


def ingest():
    client = chromadb.PersistentClient(path=CHROMA_PATH)
    openai_ef = embedding_functions.OpenAIEmbeddingFunction(
        api_key=OPENAI_API_KEY,
        model_name=EMBED_MODEL,
    )
    coll = client.get_or_create_collection(
        "books", 
        embedding_function=openai_ef,
        metadata={"hnsw:space": "cosine"}
    )

    books = parse_books(DATA_PATH)

    ids, docs, metas = [], [], []
    for i, b in enumerate(books):
        ids.append(f"id-{i}")
        docs.append(f"{b['title']}. {b['summary']}")
        metas.append({"title": b["title"]})

    coll.add(ids=ids, documents=docs, metadatas=metas)
    print(f"Ingested {len(books)} books into ChromaDB!")
