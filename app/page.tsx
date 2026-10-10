"use client";
/* eslint-disable @next/next/no-img-element -- Blob previews and provider thumbnails should not pass through an image optimizer. */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ImagePlus,
  Moon,
  Search,
  ShieldCheck,
  Sun,
  X,
} from "lucide-react";
import { validateFile } from "@/lib/photo";
import type { WebMatch } from "@/lib/search";
export default function Page() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [dark, setDark] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [matches, setMatches] = useState<WebMatch[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const value = localStorage.getItem("pinfaces-theme") === "dark";
    document.documentElement.dataset.theme = value ? "dark" : "light";
    const timer = setTimeout(() => setDark(value), 0);
    // Remove thumbnails saved by the retired local-collection version.
    indexedDB.deleteDatabase("pinfaces-local-v1");
    return () => {
      clearTimeout(timer);
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const timer = setTimeout(() => setPreview(url), 0);
    return () => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
    };
  }, [file]);
  function choose(photo?: File) {
    if (!photo || busy) return;
    setError("");
    try {
      validateFile(photo);
      setFile(photo);
      setPreview("");
      setMatches(null);
      setConsent(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the image.");
    }
  }
  function clear() {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setFile(null);
    setPreview("");
    setMatches(null);
    setConsent(false);
    setError("");
    if (input.current) input.current.value = "";
  }
  async function search() {
    if (!file || !consent || busy) return;
    setBusy(true);
    setError("");
    setMatches(null);
    const active = new AbortController();
    controller.current = active;
    const timer = setTimeout(() => active.abort(), 85000);
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        body: file,
        headers: { "Content-Type": file.type, "X-Search-Consent": "1" },
        signal: active.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Search failed.");
      if (!Array.isArray(data.matches))
        throw new Error("The search response was invalid.");
      if (!active.signal.aborted) setMatches(data.matches);
    } catch (e) {
      if (!active.signal.aborted)
        setError(e instanceof Error ? e.message : "Search failed.");
      else if (controller.current === active)
        setError("Search was cancelled or timed out. Try again.");
    } finally {
      clearTimeout(timer);
      if (controller.current === active) {
        setBusy(false);
        controller.current = null;
      }
    }
  }
  return (
    <div className="site-shell">
      <header className="header">
        <Link className="brand" href="/" aria-label="Pinfaces home">
          <span className="brand-mark">
            <Search size={21} />
          </span>
          pinfaces<span className="brand-dot">.</span>
        </Link>
        <nav aria-label="Main navigation">
          <a className="nav-link active" href="#search">
            Photo search
          </a>
        </nav>
        <div className="header-right">
          <span className="private-label">
            <ShieldCheck size={15} /> Permission first
          </span>
          <button
            className="icon-button"
            aria-label={`Switch to ${dark ? "light" : "dark"} mode`}
            onClick={() => {
              const value = !dark;
              setDark(value);
              document.documentElement.dataset.theme = value ? "dark" : "light";
              localStorage.setItem("pinfaces-theme", value ? "dark" : "light");
            }}
          >
            {dark ? <Sun size={19} /> : <Moon size={19} />}
          </button>
        </div>
      </header>
      <main>
        <section className="hero" id="search">
          <div className="eyebrow">
            <span className="status-dot" /> YOUR PHOTOS. ACROSS THE WEB.
          </div>
          <h1>
            Find where your
            <br />
            <em>photo appears.</em>
          </h1>
          <p className="hero-description">
            Search the web for copies of a photograph.
            <br />
            Real image matches. Direct links to the original pages.
          </p>
          <div className="search-card">
            <div className="card-heading">
              <span className="step-label">START WITH A PHOTO</span>
              <span>JPEG, PNG or WebP · up to 4 MB</span>
            </div>
            <input
              ref={input}
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Upload a photograph"
              onChange={(e) => choose(e.target.files?.[0])}
            />
            {!file ? (
              <button
                className={`dropzone ${dragging ? "dragging" : ""}`}
                onClick={() => input.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  choose(e.dataTransfer.files[0]);
                }}
              >
                <span className="upload-illustration">
                  <span className="illustration-card back" />
                  <span className="illustration-card front">
                    <ImagePlus size={38} />
                  </span>
                </span>
                <strong>Drop your photo here</strong>
                <span>
                  or <span className="text-link">browse files</span>
                </span>
                <small>Your image stays in this tab until you search.</small>
              </button>
            ) : (
              <div className="preview-panel">
                <div className="photo-preview">
                  {preview && (
                    <img src={preview} alt="Uploaded photograph preview" />
                  )}
                  {busy && <div className="scan-line" />}
                </div>
                <div className="preview-info">
                  <span className="file-pill">Ready to search</span>
                  <h3>{file.name}</h3>
                  <p>{(file.size / 1000000).toFixed(2)} MB · Image search</p>
                  <button className="subtle-button" onClick={clear}>
                    Choose another photo <X size={15} />
                  </button>
                </div>
              </div>
            )}
            <label className="consent web-consent">
              <input
                type="checkbox"
                checked={consent}
                disabled={busy}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                I own this image or have permission to search it. I agree to
                send it to SerpApi and Google for web image search.
              </span>
            </label>
            <div className="action-area">
              <button
                className="primary-button"
                disabled={!file || !consent || busy}
                onClick={() => void search()}
              >
                {busy ? (
                  <>
                    <span className="spinner" />
                    Searching the web…
                  </>
                ) : (
                  <>
                    <Search size={18} />
                    Search the web
                  </>
                )}
              </button>
              <span className="action-note">
                Google Lens exact image matches · No identity recognition
              </span>
            </div>
          </div>
          {error && (
            <div className="message error" role="alert">
              {error}
            </div>
          )}
          <div className="trust-row">
            <span>
              <ShieldCheck size={15} /> No Pinfaces image archive
            </span>
            <span>Server-side API key</span>
            <span>Clear your session anytime</span>
          </div>
        </section>
        {matches !== null && (
          <section className="results-section" aria-live="polite">
            <div className="section-heading">
              <div>
                <span className="section-kicker">
                  GOOGLE LENS · WEB RESULTS
                </span>
                <h2>
                  {matches.length
                    ? `${matches.length} source pages found`
                    : "No image copies found"}
                </h2>
              </div>
              <button className="subtle-button" onClick={clear}>
                Clear search <X size={15} />
              </button>
            </div>
            <p className="results-note">
              These pages were returned by Google Lens for this image. Results
              can be incomplete or incorrect; review each source. There are no
              facial similarity scores.
            </p>
            {matches.length ? (
              <div className="results-grid">
                {matches.map((match) => (
                  <article className="result-card" key={match.url}>
                    <a
                      className="result-image"
                      href={match.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {match.thumbnail ? (
                        <img
                          src={match.thumbnail}
                          alt="Image reported by Google Lens"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <ImagePlus size={36} />
                      )}
                      <span className="match-badge">Web image match</span>
                    </a>
                    <div className="result-content">
                      <span className="result-meta">{match.source}</span>
                      <h3>{match.title}</h3>
                      <a
                        href={match.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open source page <ArrowUpRight size={15} />
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <Search size={32} />
                <p>
                  The provider found no indexed copies. Try the original,
                  uncropped photograph. A photograph can be absent from
                  Google&apos;s index.
                </p>
              </div>
            )}
          </section>
        )}
        <section className="how-section">
          <div className="section-heading">
            <div>
              <span className="section-kicker">SIMPLE BY DESIGN</span>
              <h2>From photograph to source.</h2>
            </div>
          </div>
          <div className="feature-grid">
            <article>
              <span className="feature-number">01</span>
              <h3>Choose your image</h3>
              <p>
                Upload a photograph you own or are authorized to search. We
                remove embedded metadata before forwarding it.
              </p>
            </article>
            <article>
              <span className="feature-number">02</span>
              <h3>Search the public web</h3>
              <p>
                SerpApi queries Google Lens for image copies. This is not a face
                identification service or a search of your own collection.
              </p>
            </article>
            <article>
              <span className="feature-number">03</span>
              <h3>Go to the source</h3>
              <p>
                Open actual source URLs. We never invent matches, confidence
                percentages, or successful searches.
              </p>
            </article>
          </div>
        </section>
        <section className="privacy-section" id="privacy">
          <ShieldCheck size={28} />
          <h2>Your permission comes first.</h2>
          <p>
            Pinfaces does not persist uploaded images or search history.
            Searching sends a resized image to SerpApi and Google, whose
            processing and retention policies apply. SerpApi upload IDs expire
            after 10 minutes; that is not a guarantee of data deletion. Result
            thumbnails load from external hosts.
          </p>
          <p>
            Clear search removes the image and results from this tab. It does
            not delete data held by search providers. Do not upload private
            images without permission, or use this tool to identify or track
            people.
          </p>
          <a
            href="https://serpapi.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            SerpApi privacy policy <ArrowUpRight size={14} />
          </a>
        </section>
      </main>
      <footer className="footer">
        <Link className="brand" href="/">
          pinfaces<span className="brand-dot">.</span>
        </Link>
        <span>Image search with clear boundaries.</span>
        <a href="#privacy">Privacy</a>
      </footer>
    </div>
  );
}
