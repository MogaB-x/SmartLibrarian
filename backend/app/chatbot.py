from fastapi import HTTPException, APIRouter, Query, UploadFile, File
from pydantic import BaseModel
from dotenv import load_dotenv
import base64
import os
import chromadb
from chromadb.utils import embedding_functions
from openai import OpenAI
from app.tools import get_summary_by_title
import tempfile


# Setup
load_dotenv()

# Config
CHROMA_PATH = os.getenv("CHROMA_PATH")
EMBED_MODEL = os.getenv("EMBED_MODEL")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
IMAGE_MODEL = os.getenv("IMAGE_MODEL")
IMAGE_SIZE = os.getenv("IMAGE_SIZE")

if not OPENAI_API_KEY:
    os.error("OPENAI_API_KEY is not set. OpenAI features will fail.")

# Init
# Single OpenAI client for the module
oclient = OpenAI(api_key=OPENAI_API_KEY)

# Single Chroma client & embedder for the module
_chroma_client = chromadb.PersistentClient(path=CHROMA_PATH)
_embedder = embedding_functions.OpenAIEmbeddingFunction(
    api_key=OPENAI_API_KEY,
    model_name=EMBED_MODEL
)
_books = _chroma_client.get_collection("books", embedding_function=_embedder)

router = APIRouter()


# Models

class Question(BaseModel):
    """Request body for book recommendation."""
    query: str


def is_offensive(text: str) -> bool:
    """
    Use OpenAI moderation to flag offensive content.
    Returns False on any moderation API error (fail-open).
    """
    try:
        moderation = oclient.moderations.create( 
            model="omni-moderation-latest",
            input=text
        )
        return moderation.results[0].flagged
    except Exception as e:
        print("Error at is_offensive:", e)
        return False
    

def _cover_prompt(title: str, short_summary: str) -> str:
    """Build a safe book cover prompt."""
    return (
        "Generate a good, original book cover-style illustration (no text) "
        "inspired by the following book idea. Avoid copyrighted logos or exact replicas. "
        f"Title idea: {title}. "
        f"Theme & mood from summary: {short_summary}. "
        "Style: clean, high-contrast, cinematic lighting."
    )


def generate_book_image_b64(title: str, short_summary: str) -> str:
    """Generate a book cover image and return it as base64."""
    prompt = _cover_prompt(title, short_summary)
    img = oclient.images.generate(
        model="gpt-image-1",
        prompt=prompt,
        size=IMAGE_SIZE,
        quality="low"
    )
    b64 = img.data[0].b64_json
    return b64


@router.get("/tts")
def tts(text: str = Query(..., min_length=1, max_length=1000)):
    """ Text-to-speech: return an MP3 audio as base 64."""
    audio = oclient.audio.speech.create(
        model="gpt-4o-mini-tts",  
        voice="alloy",
        input=text
    )
    mp3_bytes = audio.read()
    b64_audio = base64.b64encode(mp3_bytes).decode("utf-8")
    return {"audio_base64": b64_audio}


@router.post("/recommend")
def recommend_book(question: Question):
    """
    Recommend a book based on the user's question.
    """
    try:
        if is_offensive(question.query):
            return {
                "error": "Please rephrase your question."
            }

        results = _books.query(
            query_texts=[question.query],
              n_results=1,
                include=["documents", "metadatas", "distances"]
        )

        if not results["documents"][0]:
            raise HTTPException(
                status_code=404, 
                detail="No suitable book found. Please add more context."
            )

        top_doc = results["documents"][0][0]
        top_title = results["metadatas"][0][0]["title"]
        distance = results["distances"][0][0]

        print("Raw distance from Chroma:", distance)
        similarity = 1 - distance/2
        score = max(0, min(1, similarity))

        print(f"Top book: {top_title}, Score: {score}")

        if score < 0.22:
            raise HTTPException(
                status_code=404, 
                detail="No suitable book found. Please add more context."
            )

       # Ask LLM to explain the recommendation
        user_prompt = f"Give a book \"{question.query}\". Here is a suitable title: {top_title}.\n"
        user_prompt += f"Short summary: {top_doc}\n"
        user_prompt += "Explain why it fits the user's request."

        response = oclient.chat.completions.create(
            model="gpt-4.1-nano",
            messages=[
                {"role": "system", "content": "You are a book recommendation assistant."},
                {"role": "user", "content": user_prompt}
            ]
        )

        assistant_reply = response.choices[0].message.content

        # Tool - get_summary_by_title
        full_summary = get_summary_by_title(top_title)


        try:
            image_b64 = generate_book_image_b64(top_title, top_doc)
        except Exception as e:
            print("Image generation failed:", e)
            image_b64 = None
        

        return {
            "title": top_title,
            "recommendation": assistant_reply,
            "full_summary": full_summary,
            "score": round(score, 2),
            "image_base64": image_b64
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    

@router.post("/stt")
async def stt(file: UploadFile = File(...)):
    """
    Accepts an audio file (webm/mp3/wav/m4a/ogg) and returns its transcript using Whisper.
    """
    try:
        suffix = os.path.splitext(file.filename or "")[1] or ".webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name

        with open(tmp_path, "rb") as audio_file:
            transcript = oclient.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file
            )

        return {"text": transcript.text}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"STT error: {e}")
