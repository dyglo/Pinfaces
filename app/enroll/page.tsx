"use client";
/* eslint-disable @next/next/no-img-element -- In-memory previews and authorized thumbnails use private, authenticated endpoints. */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Moon,
  Sun,
  Search,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { capturePhoto, type CapturedPhoto } from "@/lib/client-photo";
import type { FaceBox } from "@/lib/photo";
type Account = {
  email: string;
  enrollment: { status: string; expires_at: number } | null;
};
type Photo = {
  id: string;
  title: string;
  source_url: string;
  approved_at?: number;
  similarity?: number;
};
type Domain = { host: string; approved_at?: number; challenge?: string };
const consentVersion = "recognition-v1";
async function api(path: string, init?: RequestInit) {
  const response = await fetch(`/api/recognition/${path}`, {
    ...init,
    cache: "no-store",
  });
  if (response.status === 204) return {};
  const data = await response.json();
  if (!response.ok) {
    const detail =
      data.error ||
      (typeof data.detail === "string" ? data.detail : data.detail?.reason) ||
      (Array.isArray(data.detail)
        ? data.detail.map((d: { msg: string }) => d.msg).join("; ")
        : "The request could not complete.");
    throw new Error(detail);
  }
  return data;
}
const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
export default function EnrollmentPage() {
  const [dark, setDark] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [register, setRegister] = useState(false);
  const [consent, setConsent] = useState(false);
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [preview, setPreview] = useState("");
  const [face, setFace] = useState<FaceBox | null>(null);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [source, setSource] = useState("");
  const [title, setTitle] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [results, setResults] = useState<Photo[] | null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [owned, setOwned] = useState<Domain[]>([]);
  const [pending, setPending] = useState<Photo[]>([]);
  const [domain, setDomain] = useState("");
  const [domainConsent, setDomainConsent] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const verified = account?.enrollment?.status === "verified";
  async function refresh() {
    const status = await api("health");
    setAvailable(status.recognition_ready === true);
    if (!status.recognition_ready) return;
    let me: Account;
    try {
      me = await api("account");
    } catch {
      setAccount(null);
      return;
    }
    setAccount(me);
    const [pictures, sites, mine, review] = await Promise.all([
      api("photos"),
      api("domains"),
      api("domains/mine"),
      api("partner/photos"),
    ]);
    setPhotos(pictures.photos);
    setDomains(sites.domains);
    setOwned(mine.domains);
    setPending(review.photos);
  }
  useEffect(() => {
    const preferred = localStorage.getItem("pinfaces-theme");
    const value = preferred
      ? preferred === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = value ? "dark" : "light";
    const timer = setTimeout(() => setDark(value), 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      void refresh().catch(() => setAvailable(false));
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(
      new Blob([photo.bytes], { type: photo.type }),
    );
    const timer = setTimeout(() => setPreview(url), 0);
    return () => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
    };
  }, [photo]);
  async function action(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request failed.");
    } finally {
      setBusy(false);
    }
  }
  async function select(file?: File) {
    if (!file || busy) return;
    const current = ++generation.current;
    setBusy(true);
    setError("");
    setPhoto(null);
    setPreview("");
    setFace(null);
    setResults(null);
    setPhotoConsent(false);
    try {
      const captured = await capturePhoto(file);
      if (current === generation.current) setPhoto(captured);
    } catch (e) {
      if (current === generation.current)
        setError(e instanceof Error ? e.message : "Photo could not be read.");
    } finally {
      if (current === generation.current) {
        setBusy(false);
        if (input.current) input.current.value = "";
      }
    }
  }
  function clear() {
    generation.current++;
    setPhoto(null);
    setPreview("");
    setResults(null);
    setFace(null);
    setPhotoConsent(false);
    if (input.current) input.current.value = "";
  }
  async function signIn() {
    if (register) await api("auth/register", json({ email, password }));
    await api("auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username: email, password }),
    });
    setPassword("");
    await refresh();
  }
  async function begin() {
    const result = await api(
      "enrollment",
      json({ consent, version: consentVersion }),
    );
    const url = new URL(result.verification_url);
    if (url.protocol !== "https:" || url.hostname !== "verify.stripe.com")
      throw new Error("The verification destination is invalid.");
    window.location.assign(url.href);
  }
  async function query() {
    if (!photo) return;
    const result = await api("search", {
      method: "POST",
      headers: { "Content-Type": photo.type },
      body: photo.bytes,
    });
    setResults(result.matches);
    setFace(result.face);
  }
  async function add() {
    if (!photo || !photoConsent) return;
    const result = await api("photos", {
      method: "POST",
      headers: {
        "Content-Type": photo.type,
        "X-Photo-Consent": consentVersion,
        "X-Source-Url": new URL(source).href,
        "X-Photo-Title": encodeURIComponent(title || "Authorized photograph"),
      },
      body: photo.bytes,
    });
    setFace(result.face);
    setNotice(
      "Photo submitted. The website owner must approve the image and source page before it can appear in searches.",
    );
    await refresh();
  }
  return (
    <div className="site-shell enrollment-shell">
      <header className="header">
        <Link className="brand" href="/">
          pinfaces<span className="brand-dot">.</span>
        </Link>
        <nav>
          <Link className="nav-link active" href="/enroll">
            Verified recognition
          </Link>
          <Link className="nav-link" href="/image-search">
            Image copies
          </Link>
        </nav>
        <span className="private-label">
          <ShieldCheck size={16} /> Consent first
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
      </header>
      <main>
        <section className="hero recognition-hero">
          <div className="eyebrow">
            <span className="status-dot" /> VERIFIED ADULTS · AUTHORIZED SOURCES
          </div>
          <h1>
            Your photographs.
            <br />
            <em>Across different moments.</em>
          </h1>
          <p className="hero-description">
            Find photographs of yourself across participating websites, with
            verified enrollment and permission for each image.
          </p>
          <p className="recognition-boundary">
            This searches your authorized photographs. It does not identify
            strangers or scan the unrestricted web.
          </p>
        </section>
        <div className="recognition-main">
          {error && (
            <div role="alert" className="message error">
              {error}
            </div>
          )}
          {notice && (
            <div role="status" className="message success">
              {notice}
            </div>
          )}
          {available === null ? (
            <section className="search-card">
              <p role="status">Checking enrollment service…</p>
            </section>
          ) : available === false ? (
            <section className="search-card setup-state">
              <ShieldCheck size={30} />
              <h2>Enrollment is not available yet</h2>
              <p>
                The verified recognition service is awaiting configuration. No
                facial search can run until verification and secure storage are
                ready.
              </p>
              <Link className="text-link" href="/image-search">
                Use image-copy search <ArrowUpRight size={15} />
              </Link>
            </section>
          ) : !account ? (
            <section className="search-card">
              <div className="section-kicker">01 · YOUR ACCOUNT</div>
              <h2>
                {register ? "Create your account" : "Sign in to Pinfaces"}
              </h2>
              <form
                className="recognition-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(signIn);
                }}
              >
                <label>
                  Email
                  <input
                    type="email"
                    value={email}
                    autoComplete="email"
                    required
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={password}
                    autoComplete={
                      register ? "new-password" : "current-password"
                    }
                    minLength={12}
                    maxLength={128}
                    required
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <button className="primary-button" disabled={busy}>
                  {busy
                    ? "Please wait…"
                    : register
                      ? "Create account"
                      : "Sign in"}
                </button>
              </form>
              <button
                className="subtle-button"
                disabled={busy}
                onClick={() => setRegister(!register)}
              >
                {register
                  ? "Already registered? Sign in"
                  : "New here? Create an account"}
              </button>
              <p className="results-note">
                An account alone does not enable recognition. Adult document and
                selfie verification is required.
              </p>
            </section>
          ) : (
            <>
              <div className="account-bar">
                <span>{account.email}</span>
                <button
                  className="subtle-button"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await api("auth/logout", { method: "POST" });
                      clear();
                      setAccount(null);
                      setPhotos([]);
                      setDomains([]);
                      setOwned([]);
                      setPending([]);
                    })
                  }
                >
                  Sign out
                </button>
              </div>
              {!verified ? (
                <section className="search-card">
                  <div className="section-kicker">02 · VERIFIED ENROLLMENT</div>
                  <h2>Verify your adult identity</h2>
                  <p>
                    Stripe Identity checks a live identity document and matching
                    selfie. Pinfaces uses the verified selfie to create an
                    encrypted face template. We do not store your identity
                    document or full date of birth.
                  </p>
                  <label className="consent web-consent">
                    <input
                      type="checkbox"
                      checked={consent}
                      disabled={busy}
                      onChange={(e) => setConsent(e.target.checked)}
                    />
                    <span>
                      I authorize Stripe’s document/selfie verification and
                      Pinfaces biometric processing to search my own authorized
                      photographs. I understand that consent and templates
                      expire after 30 days, and I can withdraw consent and
                      delete them at any time.
                    </span>
                  </label>
                  <button
                    className="primary-button"
                    disabled={busy || !consent}
                    onClick={() => void action(begin)}
                  >
                    Continue to live verification <ArrowUpRight size={18} />
                  </button>
                  {account.enrollment && (
                    <>
                      <p className="results-note">
                        Enrollment status: {account.enrollment.status}
                      </p>
                      <button
                        className="subtle-button"
                        disabled={busy}
                        onClick={() =>
                          void action(async () => {
                            await api("enrollment/refresh", { method: "POST" });
                            await refresh();
                          })
                        }
                      >
                        Check verification status
                      </button>
                    </>
                  )}
                </section>
              ) : (
                <>
                  <section className="search-card">
                    <div className="section-kicker">
                      VERIFIED ADULT · CONSENT ACTIVE
                    </div>
                    <h2>Search your authorized photographs</h2>
                    <p>
                      Consent expires{" "}
                      {new Date(
                        account.enrollment!.expires_at * 1000,
                      ).toLocaleDateString()}
                      . Each query must match your verified enrollment.
                    </p>
                    <input
                      ref={input}
                      className="sr-only"
                      type="file"
                      aria-label="Upload a recognition photograph"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => void select(e.target.files?.[0])}
                    />
                    {!photo ? (
                      <button
                        className="dropzone recognition-dropzone"
                        disabled={busy}
                        onClick={() => input.current?.click()}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          void select(e.dataTransfer.files[0]);
                        }}
                      >
                        <Upload size={30} />
                        <strong>Choose a clear photograph of yourself</strong>
                        <span>JPEG, PNG or WebP · under 4 MB · one face</span>
                      </button>
                    ) : (
                      <div className="recognition-preview">
                        <div className="recognition-frame">
                          {preview && (
                            <img
                              src={preview}
                              alt="Recognition query preview"
                            />
                          )}
                          {face && (
                            <span
                              className="face-box"
                              aria-label="Detected face"
                              style={{
                                left: `${face.x * 100}%`,
                                top: `${face.y * 100}%`,
                                width: `${face.width * 100}%`,
                                height: `${face.height * 100}%`,
                              }}
                            />
                          )}
                        </div>
                        <p>{photo.name}</p>
                        <button
                          className="subtle-button"
                          disabled={busy}
                          onClick={clear}
                        >
                          Clear photo <X size={16} />
                        </button>
                      </div>
                    )}
                    <button
                      className="primary-button"
                      disabled={busy || !photo}
                      onClick={() => void action(query)}
                    >
                      {busy ? (
                        <>
                          <span className="spinner" />
                          Processing…
                        </>
                      ) : (
                        <>
                          <Search size={18} />
                          Find my photographs
                        </>
                      )}
                    </button>
                    <p className="results-note">
                      YuNet face detection · SFace embeddings · FAISS similarity
                      search. Queries are processed in memory and are not
                      retained.
                    </p>
                  </section>
                  {results !== null && (
                    <section
                      className="results-section recognition-results"
                      aria-live="polite"
                    >
                      <h2>
                        {results.length
                          ? `${results.length} possible matches`
                          : "No authorized matches found"}
                      </h2>
                      <p className="results-note">
                        Cosine similarity is a model score, not a probability of
                        identity. The initial threshold is provisional and has
                        not been calibrated on your collection. Review every
                        source.
                      </p>
                      {results.length ? (
                        <div className="results-grid">
                          {results.map((result) => (
                            <article className="result-card" key={result.id}>
                              <div className="result-image">
                                <img
                                  src={`/api/recognition/photos/${result.id}/thumbnail`}
                                  alt={result.title}
                                  loading="lazy"
                                />
                                <span className="match-badge">
                                  Similarity {result.similarity?.toFixed(3)}
                                </span>
                              </div>
                              <div className="result-content">
                                <h3>{result.title}</h3>
                                <a
                                  href={result.source_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Open authorized source{" "}
                                  <ArrowUpRight size={15} />
                                </a>
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <div className="empty-state">
                          <p>
                            Only photographs approved by you and a participating
                            website owner are searchable. Adding more authorized
                            photographs improves coverage.
                          </p>
                        </div>
                      )}
                    </section>
                  )}
                  <details className="search-card">
                    <summary>Add an authorized source photograph</summary>
                    <p>
                      Use a photograph of yourself that appears on one of these
                      authorized websites. The website owner must approve the
                      exact photo and source URL.
                    </p>
                    <p>
                      Participating websites:{" "}
                      {domains.length
                        ? domains.map((d) => d.host).join(", ")
                        : "None enrolled yet"}
                    </p>
                    <div className="recognition-form">
                      <label>
                        Original source page
                        <input
                          type="url"
                          placeholder="https://participating-site.example/photo"
                          value={source}
                          onChange={(e) => setSource(e.target.value)}
                        />
                      </label>
                      <label>
                        Photo title
                        <input
                          maxLength={200}
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                        />
                      </label>
                      <label className="consent web-consent">
                        <input
                          type="checkbox"
                          checked={photoConsent}
                          onChange={(e) => setPhotoConsent(e.target.checked)}
                        />
                        <span>
                          I authorize indexing this photograph of myself at the
                          specified source for 30 days.
                        </span>
                      </label>
                      <button
                        className="primary-button"
                        disabled={busy || !photo || !source || !photoConsent}
                        onClick={() => void action(add)}
                      >
                        Submit selected photograph
                      </button>
                    </div>
                  </details>
                  <section className="search-card">
                    <h2>Your source permissions</h2>
                    {photos.length ? (
                      <div className="permission-list">
                        {photos.map((p) => (
                          <div key={p.id}>
                            <span>
                              {p.title}
                              <small>
                                {p.approved_at
                                  ? "Website approved"
                                  : "Awaiting website approval"}
                              </small>
                            </span>
                            <button
                              className="subtle-button danger"
                              disabled={busy}
                              onClick={() =>
                                void action(async () => {
                                  await api(`photos/${p.id}`, {
                                    method: "DELETE",
                                  });
                                  setResults(null);
                                  await refresh();
                                })
                              }
                            >
                              Delete photo
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p>No source photographs have been enrolled.</p>
                    )}
                  </section>
                </>
              )}
              <details className="search-card">
                <summary>Participating website owner</summary>
                <p>
                  Prove ownership with a DNS TXT record. You must also approve
                  each submitted photograph and confirm the source page before
                  indexing.
                </p>
                <div className="recognition-form">
                  <label>
                    Website domain
                    <input
                      placeholder="example.com"
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                    />
                  </label>
                  <label className="consent web-consent">
                    <input
                      type="checkbox"
                      checked={domainConsent}
                      onChange={(e) => setDomainConsent(e.target.checked)}
                    />
                    <span>
                      I control this website and authorize indexing only
                      explicitly consented adult photographs I approve.
                    </span>
                  </label>
                  <button
                    className="primary-button"
                    disabled={busy || !domain || !domainConsent}
                    onClick={() =>
                      void action(async () => {
                        const result = await api(
                          "domains",
                          json({ host: domain, authorize: domainConsent }),
                        );
                        setNotice(
                          `Add DNS TXT ${result.dns_name} with value ${result.dns_value}, then verify the domain.`,
                        );
                        await refresh();
                      })
                    }
                  >
                    Request domain authorization
                  </button>
                </div>
                {owned.map((d) => (
                  <div className="domain-permission" key={d.host}>
                    <strong>{d.host}</strong>
                    {!d.approved_at && (
                      <>
                        <p>
                          DNS TXT: <code>_pinfaces.{d.host}</code>
                        </p>
                        <p className="break-text">
                          <code>pinfaces-source={d.challenge}</code>
                        </p>
                        <button
                          className="subtle-button"
                          disabled={busy}
                          onClick={() =>
                            void action(async () => {
                              await api(
                                `domains/${encodeURIComponent(d.host)}/verify`,
                                { method: "POST" },
                              );
                              await refresh();
                            })
                          }
                        >
                          Verify domain
                        </button>
                      </>
                    )}
                    <button
                      className="subtle-button danger"
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          await api(`domains/${encodeURIComponent(d.host)}`, {
                            method: "DELETE",
                          });
                          setResults(null);
                          await refresh();
                        })
                      }
                    >
                      Revoke website permission
                    </button>
                  </div>
                ))}
                {pending.length > 0 && (
                  <>
                    <h3>Photos awaiting your approval</h3>
                    <p>
                      Confirm each image actually appears at its source URL and
                      the subject has authorized indexing before approving.
                    </p>
                    <div className="results-grid">
                      {pending.map((p) => (
                        <article className="result-card" key={p.id}>
                          <div className="result-image">
                            <img
                              src={`/api/recognition/photos/${p.id}/thumbnail`}
                              alt={p.title}
                            />
                          </div>
                          <div className="result-content">
                            <h3>{p.title}</h3>
                            <a
                              href={p.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Review source <ArrowUpRight size={14} />
                            </a>
                            <button
                              className="subtle-button"
                              disabled={busy}
                              onClick={() =>
                                void action(async () => {
                                  await api(
                                    `partner/photos/${p.id}/approve`,
                                    json({
                                      confirm_source_and_subject_permission: true,
                                    }),
                                  );
                                  await refresh();
                                })
                              }
                            >
                              Confirm source and approve
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </>
                )}
              </details>
              <section className="search-card deletion-panel">
                <h3>Withdraw consent</h3>
                <p>
                  Remove enrollment templates and indexed photographs
                  immediately. Provider identity-data redaction is queued and
                  retried separately. Website permissions owned by this account
                  are also revoked.
                </p>
                <button
                  className="subtle-button danger"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await api("enrollment", { method: "DELETE" });
                      clear();
                      await refresh();
                    })
                  }
                >
                  Withdraw consent and delete photographs
                </button>
                <button
                  className="subtle-button danger"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await api("account", { method: "DELETE" });
                      clear();
                      setAccount(null);
                      setPhotos([]);
                      setDomains([]);
                      setOwned([]);
                      setPending([]);
                    })
                  }
                >
                  Delete account and all data
                </button>
              </section>
            </>
          )}
          <section className="recognition-privacy">
            <ShieldCheck size={24} />
            <h3>Permission for every face and source.</h3>
            <p>
              Only live-verified adults can enroll. Encrypted templates and
              thumbnails expire after 30 days. Identity documents remain with
              Stripe, whose policies apply. No query images, public-web
              biometric index, or identifying names inferred from faces are
              stored.
            </p>
            <a
              href="https://stripe.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Stripe privacy policy <ArrowUpRight size={14} />
            </a>
          </section>
        </div>
      </main>
      <footer className="footer">
        <Link className="brand" href="/">
          pinfaces.
        </Link>
        <span>Recognition with verified permission.</span>
        <Link href="/image-search">Image-copy search</Link>
      </footer>
    </div>
  );
}
