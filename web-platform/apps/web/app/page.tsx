const metrics = [
  { label: "Heart rate", value: "72", unit: "bpm", tone: "green" },
  { label: "SpO2", value: "98", unit: "%", tone: "blue" },
  { label: "Temperature", value: "36.7", unit: "C", tone: "orange" },
];

export default function HomePage() {
  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">+</span><span>medline</span></div>
        <nav><a className="active" href="#overview">Overview</a><a href="#history">History</a><a href="#device">Device</a><a href="#consultation">Consultation</a></nav>
        <div className="profile"><div className="avatar">AM</div><div><strong>Alex Morgan</strong><small>Patient account</small></div></div>
      </aside>
      <section className="content">
        <header className="topbar"><div><p className="eyebrow">Thursday, September 4, 2026</p><h1>Good afternoon, Alex</h1></div><button className="icon-button" aria-label="Notifications">3</button></header>
        <section className="device-banner" id="device"><div><span className="status-dot" /> Device connected <strong>MED-A7F291</strong></div><span className="muted">Last sync 2 min ago</span></section>
        <section className="metric-grid" id="overview">{metrics.map((metric) => <article className={`metric ${metric.tone}`} key={metric.label}><p>{metric.label}</p><strong>{metric.value}<small>{metric.unit}</small></strong><span>Within your usual range</span></article>)}</section>
        <section className="lower-grid"><article className="panel ecg-panel"><div className="panel-heading"><div><p className="eyebrow">Live monitoring</p><h2>ECG waveform</h2></div><span className="live-pill"><span className="status-dot" /> Live</span></div><div className="waveform" aria-label="ECG waveform visualization"><svg viewBox="0 0 800 180" preserveAspectRatio="none"><path d="M0 93H110l12-1 10 2 8-2h35l8-3 8 4 10-1h38l10-8 8 4 8 48 9-74 9 42 12-12 8 1h39l10-1 10 2h38l12-2 8 2h40l10-2 8 2h40l10-2 8 2h35l10-3 9 4h44l10-2 9 2h38l9-8 8 4 8 48 9-74 9 42 12-12 8 1h40l10-1 10 2h35l10-2 8 2h40" /></svg></div><div className="ecg-footer"><span>Session #0048</span><span>250 samples/sec</span><button>View full session <span>→</span></button></div></article><article className="panel history-panel" id="history"><div className="panel-heading"><div><p className="eyebrow">Recent activity</p><h2>Measurement history</h2></div><button className="text-button">See all</button></div><div className="history-row"><span className="history-icon blue">♥</span><div><strong>Heart rate</strong><small>Today, 14:32</small></div><b>72 <small>bpm</small></b></div><div className="history-row"><span className="history-icon orange">°</span><div><strong>Temperature</strong><small>Today, 14:30</small></div><b>36.7 <small>C</small></b></div><div className="history-row"><span className="history-icon green">O2</span><div><strong>Blood oxygen</strong><small>Today, 14:28</small></div><b>98 <small>%</small></b></div></article></section>
        <section className="consultation" id="consultation"><div><p className="eyebrow">Care team</p><h2>Your next consultation</h2><p className="muted">Dr. Maya Patel · Cardiology</p></div><button className="primary-button">Join consultation <span>→</span></button></section>
      </section>
    </main>
  );
}
