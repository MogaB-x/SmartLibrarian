import { useRef, useState, useEffect } from 'react';
import './App.css';


function App() {
  // -------------------- UI state --------------------
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);

  const [loading, setLoading] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  // Holds the playable TTS data URL
  const [audioUrl, setAudioUrl] = useState(null);
  const audioRef = useRef(null);
  // Voice recording state
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);
  // Live media handles kept in refs
  const mediaStreamRef = useRef(null);

  const [seconds, setSeconds] = useState(0);

  // -------------------- Effects --------------------
  // Simple recording timer
  useEffect(() => {
    if (!recording) return;
    setSeconds(0);
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  // Backend request
  // -------------------- Handlers --------------------
  /** Submit a text query to the /recommend endpoint */
  const handleSubmit = async (e, customQuery) => {

    if (e) e.preventDefault();
    const q = customQuery || query;   // use given query or current input

    if (!q.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('http://localhost:8000/recommend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: q })
      });

      // Check response 
      const isJson = response.headers.get('content-type')?.includes('application/json');
      const adata = isJson ? await response.json() : null;

      if (!response.ok) {
        const msg = adata?.detail || adata?.error || 'Unknown error';
        setResult({ error: msg, status: response.status });
        return;
      }

      setResult(adata);

    } catch (error) {
      console.error('Error:', error);
      setResult({ error: error.message || 'Unknown error from server.' });
    } finally {
      setLoading(false);
    }
  };

  // Audio
  /** Generate TTS from the best available text in the current result */
  const playTTS = async () => {
    if (!result || result.error) return;

    const textToRead = result.recommendation || result.full_summary || result.title;
    if (!textToRead) return;

    try {
      setTtsLoading(true);

      const res = await fetch(`http://localhost:8000/tts?text=${encodeURIComponent(textToRead)}`);
      if (!res.ok) {
        console.error('TTS error', res.status);
        return;
      }
      const data = await res.json();
      if (!data?.audio_base64) return;

      const url = `data:audio/mp3;base64,${data.audio_base64}`;

      
      setAudioUrl((prev) => {
        if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return url;
      });

      setTimeout(() => audioRef.current?.load(), 0);
    } catch (e) {
      console.error('TTS fetch failed', e);
    } finally {
      setTtsLoading(false);
    }
  };

  /** Start microphone recording using MediaRecorder */
  const startRecording = async () => {

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;

    const recorder = new MediaRecorder(stream);
    const chunks = [];

    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "audio/webm" });
      setAudioBlob(blob);

      // Stop all tracks to release the device
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
    };

    recorder.start();
    setMediaRecorder(recorder);
    setRecording(true);
  };

  /** Stop the active recording (if any) and release the mic */
  const stopRecording = () => {
    try {
    mediaRecorder?.stop();
    } finally {
      
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      setRecording(false);
    }
  };
  
  /** Send the recorded audio to /stt, then submit as a text query */
  const sendRecording = async () => {
    if (!audioBlob) return;

    try {
      const fd = new FormData();
      fd.append("file", audioBlob, "voice.webm");
      const res = await fetch("http://localhost:8000/stt", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();

      // Autofill input with transcript and search immediately
      if (res.ok) {
        setQuery(data.text);
        await handleSubmit(null, data.text);
      } else {
        setResult({ error: data.detail || "STT failed" });
      }
    } catch (e) {
      setResult({ error: e.message || "STT error" });
    } finally {
      
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      setRecording(false);
    }
  };


    return (
    <div className="App" style={{ maxWidth: 720, margin: "0 auto", padding: 20 }}>
      <header className="hero">
        <img
          src="/librarian_wide.png"
          alt="Smart Librarian mascot"
          className="hero-img"
        />
      </header>

      <div className="divider" />
      <p className="subtitle">Find your next great read!</p>

      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", gap: 10, marginBottom: 12 }}
      >
        <input
          type="text"
          placeholder="Find a book..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={loading}
          aria-label="Search books"
          style={{ flex: 1, padding: 10 }}
        />
        <button type="submit" disabled={loading} style={{ padding: "10px 16px" }}>
          {loading ? "Searching..." : "Submit"}
        </button>
      </form>

      {loading && <p>Searching...</p>}

      {!loading && result?.error && (
        <p style={{ color: "red" }}>
          {result.status ? `Error ${result.status}: ` : ""}
          {result.error}
        </p>
      )}

      {/* Voice card */}
      <div className="voice-card">
        <div className="voice-head">
          <span className={`mic-dot ${recording ? "recording" : ""}`} />
          <h3>
            🎤 Voice Mode{" "}
            <span style={{ fontWeight: 400, fontSize: "0.9em" }}>
              — speak instead of typing
            </span>
          </h3>
          <span className="voice-status">
            {recording ? "Listening…" : audioBlob ? "Ready to send" : "Idle"}
          </span>
        </div>

        <div className="voice-controls">
          {!recording ? (
            <button
              className="btn btn-primary"
              onClick={startRecording}
              disabled={loading}
            >
              🎙️ Start recording
            </button>
          ) : (
            <button className="btn" onClick={stopRecording}>
              ⏹️ Stop
            </button>
          )}

          <button className="btn" onClick={sendRecording} disabled={!audioBlob}>
            ✉️ Send to chatbot
          </button>

          {recording && (
            <span className="voice-timer">
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
            </span>
          )}
        </div>

        
      </div>

      <button className="btn btn-primary" onClick={playTTS} disabled={ttsLoading}>
        {ttsLoading ? "🔊 Generating..." : "🎙️ Generate audio response"}
      </button>

      {audioUrl && (
        <audio
          ref={audioRef}
          controls
          src={audioUrl}
          style={{ width: "100%", marginTop: 8 }}
        />
      )}

      {!loading && result && !result.error && (
        <div
          className="result"
          style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}
        >
          <h2 style={{ marginTop: 0 }}>{result.title}</h2>

          <p style={{ lineHeight: 1.6 }}>
            <strong>Recomandare:</strong> {result.recommendation}
          </p>

          <details>
            <summary style={{ cursor: "pointer" }}>Rezumat complet</summary>
            <p style={{ lineHeight: 1.6 }}>{result.full_summary}</p>
          </details>

          {result.image_base64 ? (
            <img
              src={`data:image/png;base64,${result.image_base64}`}
              alt={`book cover for ${result.title}`}
              style={{
                width: "100%",
                maxHeight: 700,
                objectFit: "cover",
                borderRadius: 8,
                border: "1px solid #eee",
              }}
            />
          ) : (
            <div
              style={{
                padding: 10,
                border: "1px dashed #ccc",
                borderRadius: 8,
                color: "#777",
              }}
            >
              (No image available for this book)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
