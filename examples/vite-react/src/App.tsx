interface AppProps {
  lastPayload: string
}

export function App({ lastPayload }: AppProps) {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 32, fontFamily: "system-ui, sans-serif" }}>
      <header>
        <h1>webAnnotation · Vite + React</h1>
        <p style={{ color: "#6b7280" }}>
          The Vite plugin injects source metadata into these elements. Click the
          floating <strong>Annotate</strong> button, pick an element, type a note and
          press <kbd>Enter</kbd> — the payload below includes <code>target.source</code>.
        </p>
      </header>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <h2>Pricing card</h2>
        <p>Pro plan — $29 / month</p>
        <ul>
          <li>Unlimited annotations</li>
          <li>React source mapping</li>
          <li>AI patch suggestions</li>
        </ul>
        <button type="button">Submit</button>
      </section>

      <section>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Last submitted payload</div>
        <pre
          style={{
            margin: 0,
            padding: 16,
            background: "#0f172a",
            color: "#e2e8f0",
            borderRadius: 12,
            fontSize: 12,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: "60vh",
            overflow: "auto",
          }}
        >
          {lastPayload}
        </pre>
      </section>
    </main>
  )
}
