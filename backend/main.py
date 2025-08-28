from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.chatbot import router as chatbot_router
from scripts.ingest import ingest

app = FastAPI(
    title="Smart Librarian",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ingest()

app.include_router(chatbot_router)
