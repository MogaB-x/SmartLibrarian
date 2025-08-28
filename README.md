# Smart Librarian 

Smart Librarian recommends books using **semantic search** (Chroma + embeddings) and provides:

* the most relevant title,
* a generated explanation (LLM) of why it fits the query,
* a **full summary** of the book,
* a **representative image** generated for the book,
* **Text-to-Speech (TTS)**: audio for the recommendation.
* **Voice Mode (STT)**: interact with the chatbot by speaking instead of typing.

---

## Architecture

* **backend/** – FastAPI: ingests summaries into Chroma, performs semantic retrieval, calls LLM/Images/TTS, and exposes REST APIs.
* **frontend/** – React (server on `http://localhost:3000`): user interface for searching, listening, voice interactions and displaying results.

---

## Requirements

* **Python 3.12** (recommended)
* **Node.js 18+** 
* A valid **OpenAI API key**

---

## 1) Backend – Setup & Run

```bash
cd backend

# (optional) create venv
py -3.12 -m venv .venv
.\.venv\Scripts\activate        # Windows
# source .venv/bin/activate     # macOS/Linux

pip install -r requirements.txt
```

### Run FastAPI server

```bash
uvicorn main:app --reload
```

* API: [http://127.0.0.1:8000](http://127.0.0.1:8000)
* Swagger UI: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

---

## 2) Frontend – Setup & Run

```bash
cd frontend
npm install
npm start
```

App will be available at **[http://localhost:3000](http://localhost:3000)**

---

## 3) API Endpoints

### **POST** `/recommend`

**Request body:**

```json
{ "query": "a fantasy adventure about friendship and courage" }
```

**Response (200):**

```json
{
  "title": "The Hobbit",
  "recommendation": "Explanation why this book fits...",
  "full_summary": "Extended summary from full_book.json...",
  "image_base64": "..."   // may be null if image generation failed
}
```

---

### **GET** `/tts`

Generates audio (base64 MP3).


**Response (200):**

```json
{ "audio_base64": "SUQzAwAAA..." }
```

---

### **POST** `/stt`

Transcribes spoken audio into text using Whisper.

**Response (200):**

```json
{ "text": "transcribed user speech" }
```

---

## 4) Application Flow

1. **Ingestion**: `book_summaries.md` → (title + short summary) → embeddings into Chroma.
2. **Search**: on `/recommend`, user query is embedded → semantic search in Chroma.
3. **Selection**: pick top-1 and compute normalized score.
4. **LLM**: `GEN_MODEL` generates a short justification.
5. **Full summary**: retrieved from `full_book.json`.
6. **Image (optional)**: `IMAGE_MODEL` generates a cover-style image (`image_base64`).
7. **TTS (optional)**: `/tts?text=...` returns `audio_base64`, played in `<audio>`.
8. **Voice Mode (STT)**: `/stt` receives microphone input, transcribes it, and sends the transcript as query → chatbot responds.

---

## 5) Troubleshooting

* **401 invalid\_api\_key**

  * Check `.env` → must start with `sk-...`
  * Restart backend after editing `.env`

* **Python 3.13 issues (`orjson` crash)**

  * Use Python 3.12

---

## 6) Project Structure

```
SmartLibrarian/
├─ backend/
│  ├─ main.py               # FastAPI entrypoint
│  ├─ app/
│  │  ├─ chatbot.py         # routes: /recommend, /tts + logic
│  │  ├─ tools.py
│  ├─ data/
│  │  ├─ book_summaries.md  # short summaries (embeddings)
│  │  └─ full_book.json     # extended summaries
│  ├─ scripts/
│  │  ├─ ingest.py
│  ├─ requirements.txt
│  └─ .env                  # set up your OpenAI API key
└─ frontend/
   ├─ src/App.js
   ├─ public/
   │  └─ librarian_wide.png
   ├─ package.json
```
