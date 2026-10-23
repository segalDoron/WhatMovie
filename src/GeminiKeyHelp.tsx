import { useEffect, useState, type ReactNode } from "react";
import { Chevron } from "./Icons";

const FONT = "DM Sans, system-ui, sans-serif";

/* ---------- Illustrations (simplified drawings of each step) ---------- */
function Frame({ url, label, children }: { url: string; label: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 400 250" width="100%" role="img" aria-label={label} fontFamily={FONT}>
      <rect x="1" y="1" width="398" height="248" rx="14" fill="var(--surface)" stroke="var(--line)" strokeWidth="2" />
      <path d="M1 36h398" stroke="var(--line)" strokeWidth="2" />
      {[20, 36, 52].map((cx) => <circle key={cx} cx={cx} cy="18" r="5" fill="var(--line)" />)}
      <rect x="76" y="8" width="300" height="20" rx="10" fill="var(--bg)" stroke="var(--line)" />
      <text x="92" y="22" fontSize="11" fill="var(--muted)">{url}</text>
      {children}
    </svg>
  );
}

const Highlight = ({ x, y, w, h, r = 10 }: { x: number; y: number; w: number; h: number; r?: number }) => (
  <rect x={x} y={y} width={w} height={h} rx={r} fill="none" stroke="var(--accent)" strokeWidth="3" />
);

function Step1() {
  return (
    <Frame url="aistudio.google.com/apikey" label="The Google AI Studio page with a Sign in with Google button">
      <text x="200" y="104" fontSize="16" fontWeight="700" fill="var(--ink)" textAnchor="middle">Google AI Studio</text>
      <rect x="110" y="128" width="180" height="42" rx="21" fill="var(--surface)" stroke="var(--line)" strokeWidth="2" />
      <text x="200" y="154" fontSize="13" fontWeight="700" fill="var(--ink)" textAnchor="middle">Sign in with Google</text>
      <Highlight x={104} y={122} w={192} h={54} r={27} />
    </Frame>
  );
}

function Step2() {
  return (
    <Frame url="aistudio.google.com/apikey" label="The API keys page with a Create API key button at the top right">
      <rect x="1" y="37" width="92" height="212" fill="var(--bg)" />
      {[62, 84, 106].map((y) => <rect key={y} x="14" y={y} width="62" height="8" rx="4" fill="var(--line)" />)}
      <text x="112" y="76" fontSize="16" fontWeight="800" fill="var(--ink)">API keys</text>
      <rect x="250" y="54" width="128" height="32" rx="16" fill="var(--primary)" />
      <text x="314" y="75" fontSize="12" fontWeight="700" fill="var(--on-primary)" textAnchor="middle">Create API key</text>
      <Highlight x={244} y={48} w={140} h={44} r={22} />
      <rect x="112" y="120" width="250" height="10" rx="5" fill="var(--line)" />
      <rect x="112" y="142" width="190" height="10" rx="5" fill="var(--line)" />
    </Frame>
  );
}

function Step3() {
  return (
    <Frame url="aistudio.google.com/apikey" label="A dialog asking you to choose a Google Cloud project">
      <rect x="1" y="37" width="398" height="212" fill="var(--ink)" opacity=".12" />
      <rect x="64" y="62" width="272" height="164" rx="14" fill="var(--surface)" stroke="var(--line)" strokeWidth="2" />
      <text x="84" y="92" fontSize="14" fontWeight="800" fill="var(--ink)">Create API key</text>
      <text x="84" y="116" fontSize="11" fill="var(--muted)">Choose a project</text>
      <rect x="84" y="124" width="232" height="34" rx="8" fill="var(--bg)" stroke="var(--line)" strokeWidth="2" />
      <text x="96" y="146" fontSize="12" fill="var(--ink)">Select or create a project</text>
      <text x="298" y="146" fontSize="12" fill="var(--muted)">▾</text>
      <Highlight x={80} y={120} w={240} h={42} r={10} />
      <rect x="196" y="178" width="120" height="32" rx="16" fill="var(--primary)" />
      <text x="256" y="198" fontSize="12" fontWeight="700" fill="var(--on-primary)" textAnchor="middle">Create API key</text>
    </Frame>
  );
}

function Step4() {
  return (
    <Frame url="aistudio.google.com/apikey" label="A list showing your new key with a copy button next to it">
      <text x="24" y="66" fontSize="14" fontWeight="800" fill="var(--ink)">Your API keys</text>
      <rect x="24" y="80" width="352" height="64" rx="12" fill="var(--bg)" stroke="var(--line)" strokeWidth="2" />
      <text x="40" y="104" fontSize="12" fontWeight="700" fill="var(--ink)">Gemini key</text>
      <text x="40" y="126" fontSize="12" fill="var(--muted)">AIza••••••••••••••••3fA9</text>
      <rect x="326" y="96" width="14" height="16" rx="3" fill="none" stroke="var(--ink)" strokeWidth="2" />
      <rect x="331" y="101" width="14" height="16" rx="3" fill="var(--bg)" stroke="var(--ink)" strokeWidth="2" />
      <Highlight x={316} y={90} w={42} h={36} r={18} />
      <text x="200" y="190" fontSize="12" fill="var(--muted)" textAnchor="middle">Copy it now and keep it private</text>
    </Frame>
  );
}

function Step5() {
  return (
    <Frame url="your-app-address / Settings" label="The Movie Tonight Settings window with the key pasted and a Save key button">
      <rect x="64" y="56" width="272" height="170" rx="14" fill="var(--surface)" stroke="var(--line)" strokeWidth="2" />
      <text x="84" y="86" fontSize="15" fontWeight="800" fill="var(--ink)">Settings</text>
      <text x="84" y="110" fontSize="11" fontWeight="700" fill="var(--ink)">Gemini API key</text>
      <rect x="84" y="120" width="232" height="34" rx="10" fill="var(--bg)" stroke="var(--line)" strokeWidth="2" />
      <text x="96" y="142" fontSize="13" fill="var(--muted)">••••••••••••••••••</text>
      <rect x="236" y="176" width="80" height="32" rx="12" fill="var(--accent)" />
      <text x="276" y="196" fontSize="12" fontWeight="700" fill="#fff" textAnchor="middle">Save key</text>
      <Highlight x={230} y={170} w={92} h={44} r={14} />
    </Frame>
  );
}

/**
 * A real screenshot wins when one exists at /help/step-N.png (put your own in the public/help folder).
 * Until then the drawing above is shown.
 */
function StepImage({ n, alt, children }: { n: number; alt: string; children: ReactNode }) {
  const [real, setReal] = useState(false);
  useEffect(() => {
    const img = new Image();
    img.onload = () => setReal(true);
    img.src = `/help/step-${n}.png`;
  }, [n]);
  return (
    <figure className="hp-fig">
      {real ? <img src={`/help/step-${n}.png`} alt={alt} loading="lazy" /> : children}
      <figcaption>{real ? alt : "Simplified drawing. Google's screens may look a little different."}</figcaption>
    </figure>
  );
}

const STEPS: { title: string; body: ReactNode; alt: string; art: ReactNode }[] = [
  {
    title: "Open Google AI Studio",
    body: (
      <>
        Go to <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a> and sign
        in with your Google account. Accept the terms if Google asks.
      </>
    ),
    alt: "The Google AI Studio sign-in page",
    art: <Step1 />,
  },
  {
    title: "Click “Create API key”",
    body: "On the API keys page, click Create API key. On some versions you first click Get API key in the left menu.",
    alt: "The API keys page with the Create API key button",
    art: <Step2 />,
  },
  {
    title: "Choose a project",
    body: "Pick an existing Google Cloud project, or create a new one. For a first key, a new project is the simplest choice. Then confirm.",
    alt: "The dialog for choosing a project",
    art: <Step3 />,
  },
  {
    title: "Copy your key",
    body: "Google shows your key. Use the copy button and keep it private: don't post it online or share it with anyone.",
    alt: "The new key with a copy button",
    art: <Step4 />,
  },
  {
    title: "Paste it in Movie Tonight",
    body: (
      <>
        In the app, open <strong>Who am I? → Settings</strong>, paste the key into the Gemini API key field, and click{" "}
        <strong>Save key</strong>. You'll see “Key added” when it works.
      </>
    ),
    alt: "The Settings window with the key pasted",
    art: <Step5 />,
  },
];

export default function GeminiKeyHelp() {
  return (
    <main className="hp">
      <header className="hp-top">
        <a className="back" href="/">
          <Chevron /> Back to the app
        </a>
      </header>

      <h1 className="hp-title">Add your own Gemini key</h1>
      <p className="hp-lead">A short guide: what the key is for, what happens without it, how it stays safe, and how to get one.</p>

      <section className="hp-card" aria-labelledby="why">
        <h2 id="why">Why add a key?</h2>
        <p>
          Movie Tonight uses Google's Gemini AI to read your answers (mood, genres, who's watching, and so on) and turn them into a
          precise search. With your own key, Gemini also looks at the best movies the search found, rates each one against your answers and
          the movies you liked, favorited and disliked, removes the ones that clearly don't fit, and helps put the best matches first. A
          Gemini key is the pass that lets the app ask Gemini on your behalf.
        </p>
        <p>With your own key:</p>
        <ul>
          <li><strong>It runs on your own allowance.</strong> Gemini limits how much each key can be used. Your key isn't shared with other people, so the fine-tuning is less likely to be skipped when the app's shared key is busy.</li>
          <li><strong>You stay in control.</strong> The usage shows in your own Google account, and you can remove the key from the app at any time.</li>
          <li><strong>Your list is checked by Gemini.</strong> The extra rating and the removal of poor fits only happen with your own key. The app never uses its own key for this.</li>
        </ul>
        <p className="hp-note">Google offers a free tier for Gemini with limits. Use above those limits is billed by Google to your account, so check Google's current pricing before you rely on it.</p>
      </section>

      <section className="hp-card" aria-labelledby="without">
        <h2 id="without">What if I don't add one?</h2>
        <p>Everything still works. Nothing is locked, and you don't have to sign up for anything at Google.</p>
        <ul>
          <li><strong>Search:</strong> the app uses its own shared Gemini key for the search fine-tuning, and ranks your list with its built-in scoring (your likes, favorites, dislikes, ratings and genres).</li>
          <li><strong>If the shared key is busy or unavailable:</strong> the search falls back to the app's built-in rules. It still filters by genre, age rating, stars, years and streaming service, but without Gemini's extra fine-tuning.</li>
          <li><strong>The effect on results:</strong> you still get good results, but they may be a little less tailored, mostly for unusual combinations of answers.</li>
          <li><strong>Gemini's check of your list:</strong> it needs your own key, so without one it is skipped.</li>
        </ul>
      </section>

      <section className="hp-card" aria-labelledby="safe">
        <h2 id="safe">How your key stays safe</h2>
        <ul>
          <li><strong>Encrypted before it's stored.</strong> The app's server encrypts the key (AES-256-GCM) before it is saved. The secret used for that lives only on the server, separate from the database.</li>
          <li><strong>Tied to your account.</strong> The saved key can only be used for your own login, and your browser can't read it back. After you save it, the app only shows its last 4 characters.</li>
          <li><strong>Used only to call Google for you.</strong> The server decrypts it only while handling your request, sends it to Google over a secure connection, and never puts it in a link or a log.</li>
          <li><strong>You can remove it any time.</strong> Open Settings and click Remove key. If you ever think it leaked, also delete it in Google AI Studio and create a new one.</li>
        </ul>
      </section>

      <section aria-labelledby="steps">
        <h2 id="steps" className="hp-steps-title">Get your key, step by step</h2>
        <ol className="hp-steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="hp-step">
              <div className="hp-step-text">
                <span className="hp-num" aria-hidden="true">{i + 1}</span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              </div>
              <StepImage n={i + 1} alt={s.alt}>{s.art}</StepImage>
            </li>
          ))}
        </ol>
      </section>

      <section className="hp-card" aria-labelledby="trouble">
        <h2 id="trouble">Something not working?</h2>
        <ul>
          <li><strong>You can't create a key.</strong> School and work Google accounts can block it. Try a personal Google account.</li>
          <li><strong>The app says Google rejected the key.</strong> Copy it again with no spaces before or after, and check that the Gemini API is available in your country.</li>
          <li><strong>Google's screens look different.</strong> Google changes its pages from time to time. The steps stay the same: sign in, create a key, choose a project, copy it.</li>
        </ul>
      </section>
    </main>
  );
}
