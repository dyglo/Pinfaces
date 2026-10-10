"use client";
/* eslint-disable @next/next/no-img-element -- Private local thumbnails and blob previews cannot use the image optimizer. */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Fingerprint,
  ImagePlus,
  Layers3,
  LockKeyhole,
  Moon,
  ScanFace,
  Search,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  exactMatches,
  imageHash,
  RETENTION_MS,
  thumbnail,
  validateFile,
  validateSource,
  type Detection,
  type PhotoRecord,
} from "@/lib/photo";
import { BrowserCollection } from "@/lib/storage";
const collection = new BrowserCollection();
type Tab = "search" | "collection";
export default function Page() {
  const [tab, setTab] = useState<Tab>("search");
  const [dark, setDark] = useState(false);
  const [records, setRecords] = useState<PhotoRecord[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [detection, setDetection] = useState<Detection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState(false);
  const [results, setResults] = useState<PhotoRecord[] | null>(null);
  const [source, setSource] = useState("");
  const [title, setTitle] = useState("");
  const [consent, setConsent] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  useEffect(() => {
    const preferred = localStorage.getItem("pinfaces-theme");
    const value = preferred
      ? preferred === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = value ? "dark" : "light";
    const timer = setTimeout(() => setDark(value), 0);
    const refresh = () => {
      void collection
        .list()
        .then(setRecords)
        .catch(() =>
          setError(
            "Browser storage is unavailable. Enable site storage to use your collection.",
          ),
        );
    };
    refresh();
    const interval = setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
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
  function changeTheme() {
    const value = !dark;
    setDark(value);
    document.documentElement.dataset.theme = value ? "dark" : "light";
    localStorage.setItem("pinfaces-theme", value ? "dark" : "light");
  }
  function choose(photo?: File) {
    if (!photo || busy) return;
    setError("");
    setNotice("");
    try {
      validateFile(photo);
      generation.current++;
      setFile(photo);
      setDetection(null);
      setResults(null);
      setConsent(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to read this file.");
    }
  }
  function reset() {
    generation.current++;
    setFile(null);
    setPreview("");
    setDetection(null);
    setResults(null);
    setError("");
    setNotice("");
    setConsent(false);
    if (input.current) input.current.value = "";
  }
  async function analyze(): Promise<Detection> {
    if (!file) throw new Error("Choose a photograph first.");
    const response = await fetch("/api/detect", {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
      signal: AbortSignal.timeout(30_000),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to detect a face.");
    const data = body as Detection;
    setDetection(data);
    if (!data.faces.length)
      throw new Error(
        "No face detected. Try a clear, front-facing photograph with good lighting.",
      );
    if (data.faces.length > 1)
      throw new Error(
        "Multiple faces detected. Choose a photograph with just one adult.",
      );
    return data;
  }
  async function run(action: "search" | "add") {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    setResults(null);
    const current = generation.current;
    try {
      const sourceUrl = action === "add" ? validateSource(source) : "";
      if (action === "add" && !consent)
        throw new Error(
          "Confirm you have permission and that the photo depicts an adult.",
        );
      await analyze();
      const hash = await imageHash(await file.arrayBuffer());
      const fresh = await collection.list();
      if (current !== generation.current) return;
      if (action === "search") {
        setRecords(fresh);
        setResults(exactMatches(hash, fresh));
      } else {
        const record: PhotoRecord = {
          id: crypto.randomUUID(),
          hash,
          thumbnail: await thumbnail(file),
          sourceUrl,
          title: title.trim().slice(0, 120) || "Untitled photograph",
          createdAt: Date.now(),
          expiresAt: Date.now() + RETENTION_MS,
          adultConsentAttested: true,
        };
        await collection.add(record);
        setRecords(await collection.list());
        setNotice(
          "Photo added to your private collection. It expires in 7 days.",
        );
        setSource("");
        setTitle("");
        setConsent(false);
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove(id?: string) {
    try {
      if (id) await collection.remove(id);
      else await collection.clear();
      setRecords(await collection.list());
      setResults(null);
      setNotice(
        id
          ? "Photo and its metadata deleted from this browser."
          : "Your collection has been deleted from this browser.",
      );
    } catch {
      setError("Deletion failed. Please try again.");
    }
  }
  const visible = (tab === "collection" ? records : (results ?? [])).filter(
    (r) => records.some((saved) => saved.id === r.id),
  );
  return (
    <div className="site-shell">
      <header className="header">
        <Link className="brand" href="/" aria-label="Pinfaces home">
          <span className="brand-mark">
            <ScanFace size={23} />
          </span>
          pinfaces<span className="brand-dot">.</span>
        </Link>
        <nav aria-label="Main navigation">
          <button
            className={tab === "search" ? "nav-link active" : "nav-link"}
            onClick={() => {
              setTab("search");
              setError("");
              setNotice("");
            }}
          >
            Photo search
          </button>
          <button
            className={tab === "collection" ? "nav-link active" : "nav-link"}
            onClick={() => {
              setTab("collection");
              setError("");
              setNotice("");
            }}
          >
            My collection <span className="count">{records.length}</span>
          </button>
        </nav>
        <div className="header-right">
          <span className="private-label">
            <LockKeyhole size={13} /> Private by design
          </span>
          <button
            className="icon-button"
            onClick={changeTheme}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {dark ? <Sun size={19} /> : <Moon size={19} />}
          </button>
        </div>
      </header>
      <main>
        <section className="hero">
          <div className="eyebrow">
            <span className="status-dot" /> YOUR PHOTOS. YOUR CONTROL.
          </div>
          <h1>
            {tab === "search" ? (
              <>
                Find the photo.
                <br />
                <span>Keep your privacy.</span>
              </>
            ) : (
              <>
                A collection that’s
                <br />
                <span>yours alone.</span>
              </>
            )}
          </h1>
          <p className="hero-description">
            {tab === "search"
              ? "A clearer way to explore your own photographs. Search exact copies in your private collection, without giving up control."
              : "Add adult photographs you have permission to use. Your collection stays in this browser and expires after 7 days."}
          </p>
          <div className="search-card">
            <div className="card-heading">
              <div>
                <ScanFace size={19} />
                <span>
                  {tab === "search"
                    ? "Start with a photograph"
                    : "Add to your collection"}
                </span>
              </div>
              <span className="step-label">
                {file ? "02 / READY TO EXPLORE" : "01 / UPLOAD A PHOTO"}
              </span>
            </div>
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label="Upload a photograph"
              onChange={(e) => choose(e.target.files?.[0])}
              disabled={busy}
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
                    <ScanFace size={38} strokeWidth={1.3} />
                    <span className="mini-plus">
                      <ImagePlus size={15} />
                    </span>
                  </span>
                </span>
                <strong>Drop your photo here</strong>
                <span>
                  or{" "}
                  <span className="text-link">
                    browse files <ArrowUpRight size={13} />
                  </span>
                </span>
                <small>JPG, PNG or WebP · Up to 4 MB · One adult face</small>
              </button>
            ) : (
              <div className="preview-panel">
                <div className="photo-preview">
                  <img src={preview} alt="Your uploaded photograph" />
                  {detection?.faces.map((face, i) => (
                    <span
                      key={i}
                      className="face-box"
                      style={{
                        left: `${face.x * 100}%`,
                        top: `${face.y * 100}%`,
                        width: `${face.width * 100}%`,
                        height: `${face.height * 100}%`,
                      }}
                      aria-label="Detected face"
                    />
                  ))}
                  {busy && <div className="scan-line" />}
                </div>
                <div className="preview-info">
                  <span className="file-pill">
                    <Check size={12} /> PHOTO SELECTED
                  </span>
                  <strong>{file.name}</strong>
                  <span>
                    {(file.size / 1000000).toFixed(2)} MB ·{" "}
                    {detection
                      ? `${detection.faces.length} face${detection.faces.length === 1 ? "" : "s"} detected`
                      : "Ready for face detection"}
                  </span>
                  <button
                    className="subtle-button"
                    onClick={reset}
                    disabled={busy}
                  >
                    <X size={14} /> Choose another photo
                  </button>
                </div>
              </div>
            )}
            {tab === "collection" && file && (
              <div className="collection-fields">
                <label>
                  Photo title
                  <input
                    value={title}
                    maxLength={120}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Give this photograph a name"
                    disabled={busy}
                  />
                </label>
                <label>
                  Original source URL
                  <input
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    type="url"
                    placeholder="https://example.com/my-photo"
                    disabled={busy}
                    required
                  />
                </label>
                <label className="consent">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    disabled={busy}
                  />
                  <span>
                    I have permission to store this photograph, and the person
                    pictured is 18 or older. This is my attestation, not
                    identity or age verification.
                  </span>
                </label>
              </div>
            )}
            <div className="action-area">
              <button
                className="primary-button"
                disabled={
                  !file ||
                  busy ||
                  (tab === "collection" && (!consent || !source))
                }
                onClick={() => void run(tab === "search" ? "search" : "add")}
              >
                {busy ? (
                  <>
                    <span className="spinner" />{" "}
                    {tab === "search"
                      ? "Detecting & searching…"
                      : "Detecting & saving…"}
                  </>
                ) : (
                  <>
                    {tab === "search" ? (
                      <Search size={18} />
                    ) : (
                      <ImagePlus size={18} />
                    )}{" "}
                    {tab === "search"
                      ? "Search my collection"
                      : "Add photograph"}
                    <ArrowRight size={17} />
                  </>
                )}
              </button>
              <span className="action-note">
                <LockKeyhole size={12} /> No image is retained by the detection
                service
              </span>
            </div>
          </div>
          {error && (
            <div className="message error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="message success" role="status">
              <Check size={17} />
              {notice}
            </div>
          )}
          <div className="trust-row">
            <span>
              <ShieldCheck size={15} /> Browser-local collection
            </span>
            <span>
              <Fingerprint size={15} /> No identity matching
            </span>
            <span>
              <Trash2 size={15} /> Delete at any time
            </span>
          </div>
        </section>
        {(tab === "collection" || results !== null) && (
          <section className="results-section" aria-live="polite">
            <div className="section-heading">
              <div>
                <span className="section-kicker">
                  {tab === "collection"
                    ? "YOUR PRIVATE LIBRARY"
                    : "SEARCH COMPLETE"}
                </span>
                <h2>
                  {tab === "collection"
                    ? "My collection"
                    : "Exact-image results"}{" "}
                  <span>{visible.length}</span>
                </h2>
              </div>
              {tab === "collection" && records.length > 0 && (
                <button
                  className="subtle-button danger"
                  onClick={() => void remove()}
                >
                  <Trash2 size={15} /> Delete all photos
                </button>
              )}
            </div>
            {visible.length ? (
              <>
                <p className="results-note">
                  {tab === "search"
                    ? "Identical file bytes, verified by SHA-256. This is not a facial similarity score."
                    : "Stored only in this browser. Expired photos are removed when the app is active."}
                </p>
                <div className="results-grid">
                  {visible.map((record) => (
                    <article className="result-card" key={record.id}>
                      <div className="result-image">
                        <img src={record.thumbnail} alt={record.title} />
                        <span className="match-badge">
                          {tab === "search" ? (
                            <>
                              <Check size={12} /> Exact file match
                            </>
                          ) : (
                            <>
                              <LockKeyhole size={12} /> Only on this device
                            </>
                          )}
                        </span>
                      </div>
                      <div className="result-content">
                        <h3>{record.title}</h3>
                        <a
                          href={record.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {new URL(record.sourceUrl).hostname}
                          <ArrowUpRight size={15} />
                        </a>
                        <p title={record.sourceUrl}>{record.sourceUrl}</p>
                        <div className="result-meta">
                          <span>
                            Expires{" "}
                            {new Date(record.expiresAt).toLocaleDateString()}
                          </span>
                          <button
                            className="icon-button"
                            onClick={() => void remove(record.id)}
                            aria-label={`Delete ${record.title}`}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty-state">
                <Layers3 size={32} />
                <h3>
                  {tab === "collection"
                    ? "Your collection starts here"
                    : "No exact copies found"}
                </h3>
                <p>
                  {tab === "collection"
                    ? "Upload a photograph above and add its original source link. No sample photos or invented results."
                    : records.length
                      ? "This file is not in your collection. A crop, edit, or re-encoded copy counts as a different file."
                      : "Your collection is empty. Add a photograph first, then search with that same file."}
                </p>
                {tab === "search" && (
                  <button
                    className="subtle-button"
                    onClick={() => setTab("collection")}
                  >
                    Build my collection <ArrowRight size={15} />
                  </button>
                )}
              </div>
            )}
          </section>
        )}
        <section className="how-section">
          <div className="section-heading">
            <div>
              <span className="section-kicker">SIMPLE BY DESIGN</span>
              <h2>
                A little less friction.
                <br />A lot more control.
              </h2>
            </div>
            <p>
              Useful photo tools.
              <br />
              Without a public face index.
            </p>
          </div>
          <div className="feature-grid">
            <article>
              <span className="feature-number">01</span>
              <div className="feature-icon">
                <Upload size={23} />
              </div>
              <h3>Bring your photograph</h3>
              <p>
                Upload one clear, front-facing adult photo. Real face detection
                marks the face in your preview.
              </p>
            </article>
            <article>
              <span className="feature-number">02</span>
              <div className="feature-icon">
                <Search size={23} />
              </div>
              <h3>Find an exact copy</h3>
              <p>
                Search files you’ve added to your collection. Only identical
                files produce a match, with your saved source link.
              </p>
            </article>
            <article>
              <span className="feature-number">03</span>
              <div className="feature-icon">
                <ShieldCheck size={23} />
              </div>
              <h3>Stay in control</h3>
              <p>
                Your collection is local to this browser. Delete it anytime.
                Photos expire after seven days of storage.
              </p>
            </article>
          </div>
        </section>
        <section className="privacy-banner">
          <span className="privacy-icon">
            <LockKeyhole size={25} />
          </span>
          <div>
            <h3>Privacy is the starting point.</h3>
            <p>
              No web scraping. No identity tracking. No shared image database.
            </p>
          </div>
          <a href="#privacy">
            How your data is handled <ChevronRight size={17} />
          </a>
        </section>
        <section id="privacy" className="privacy-details">
          <h2>What stays, and what doesn’t.</h2>
          <p>
            Searching sends your selected image over HTTPS to our face detection
            service for processing in memory. The service returns face boxes and
            does not write your image to storage. Your search image stays in the
            page until you replace it or leave.
          </p>
          <p>
            Adding a photo stores a thumbnail, its SHA-256 file hash, your
            source link, and your adult/permission attestation in this browser’s
            IndexedDB. Entries expire after 7 days and are purged while the app
            is active or when you next open it. Closing the browser pauses
            cleanup. Browser/site-data deletion also removes your collection.
            Shared-device users may access this browser’s collection; there is
            no account login or verified authorization.
          </p>
          <p>
            Face detection can miss faces or mark non-faces, particularly with
            profiles or poor lighting. It cannot verify age, consent, or
            identity. Do not add photographs of minors or photographs you are
            not authorized to use.
          </p>
        </section>
      </main>
      <footer>
        <Link className="brand" href="/">
          pinfaces<span className="brand-dot">.</span>
        </Link>
        <span>A more private perspective.</span>
        <a href="#privacy">
          Privacy & retention <ArrowUpRight size={13} />
        </a>
        <span>© {new Date().getFullYear()} Pinfaces</span>
      </footer>
    </div>
  );
}
