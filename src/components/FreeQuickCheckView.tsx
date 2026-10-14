"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  CarFront,
  FileText,
  Gauge,
  History,
  Info,
  MessageCircleQuestion,
  RefreshCw,
  ShieldCheck,
  Target,
} from "lucide-react";
import type { FreeQuickCheckResponse } from "@/lib/freeQuickCheck";
import type { VehicleIntake } from "@/types/domain";

const visitQuestions = [
  "Ask for the VIN and a current vehicle-history report. Check that the identifiers match.",
  "Request maintenance invoices and ask about repairs related to the areas above, when available.",
  "Confirm that an independent mechanic can inspect the vehicle before you commit to buying it.",
];

export function FreeQuickCheckView({
  report,
  onRetry,
  vehicle,
}: {
  report: FreeQuickCheckResponse;
  onRetry: () => void;
  vehicle?: VehicleIntake;
}) {
  const vehicleName = [
    report.vehicle.year,
    report.vehicle.make,
    report.vehicle.model,
    report.vehicle.trim,
  ]
    .filter(Boolean)
    .join(" ");
  const matched = report.coverage.status === "matched";
  const coverageLabel = matched ? "Matched" : report.coverage.status === "limited" ? "Limited" : "Unavailable";

  return <article className="report-shell report-aimoove free-report-aimoove">
    <div className="report-toolbar report-aimoove-toolbar">
      <span>AUTOCHECK / QC <b aria-hidden="true">/</b> FREE QUICK CHECK</span>
      <div>
        <Link className="report-toolbar-link" href="/check?step=choose">Report options <ArrowUpRight size={15} /></Link>
        <a className="report-print-button" href="#free-next-steps" aria-label="Skip to next steps"><ArrowRight size={17} /></a>
      </div>
    </div>

    <header className="report-hero">
      <div className="report-hero-visual" aria-hidden="true"><CarFront size={108} strokeWidth={1.15} /><span>MODEL HISTORY / FREE</span></div>
      <div className="report-hero-copy">
        <p className="report-eyebrow">Free quick check</p>
        <h1>{vehicleName || "Vehicle details not found"}</h1>
        <p className="report-hero-subtitle">A limited look at historical model-year information. It can help you choose what to investigate, but it cannot assess this vehicle&apos;s condition.</p>
        <div className="report-hero-meta">
          {report.vehicle.year != null && <span><BadgeCheck size={15} /> {report.vehicle.year}</span>}
          {vehicle?.mileageKm != null && <span><Gauge size={15} /> {new Intl.NumberFormat("en-CA").format(vehicle.mileageKm)} km</span>}
          <span><FileText size={15} /> Historical data only</span>
        </div>
      </div>
      <div className="report-hero-action">
        <span className="report-eyebrow">Coverage status</span>
        <strong>{coverageLabel}</strong>
        <small>Not a vehicle condition score</small>
        <a className="button button-primary" href="#free-summary">Review the summary <ArrowRight size={17} /></a>
      </div>
    </header>

    <section id="free-summary" className="report-verdict report-verdict-unknown">
      <div className="report-verdict-main">
        <div className="report-verdict-mark free-coverage-mark" aria-label={`${coverageLabel} historical data coverage`}><span>{matched ? "OK" : "--"}</span><small>DATA</small></div>
        <div>
          <p className="report-eyebrow">Available history</p>
          <h2>Start with what the history can tell you.</h2>
          <p>{report.coverage.label}</p>
        </div>
      </div>
      <div className="report-verdict-status">
        <span className="report-status-label">Scope</span>
        <strong>Model-level</strong>
        <small>Historical patterns are prompts for questions, not findings about this specific vehicle.</small>
      </div>
      <a className="report-verdict-link" href="#free-next-steps">See what to ask <ArrowRight size={16} /></a>
    </section>

    <div className="report-kpi-grid" aria-label="Free quick check indicators">
      <div className="report-kpi-card accent-green"><span className="report-kpi-icon"><ShieldCheck size={18} /></span><span className="report-kpi-label">Data coverage</span><strong>{coverageLabel}</strong><small>Historical source match</small></div>
      <div className="report-kpi-card accent-amber"><span className="report-kpi-icon"><Target size={18} /></span><span className="report-kpi-label">Areas surfaced</span><strong>{report.topHistoricalAreas.length}</strong><small>Categories to investigate</small></div>
      <div className="report-kpi-card accent-slate"><span className="report-kpi-icon"><History size={18} /></span><span className="report-kpi-label">Historical signal</span><strong>Model-level</strong><small>Not a vehicle-specific diagnosis</small></div>
      <div className="report-kpi-card accent-red"><span className="report-kpi-icon"><MessageCircleQuestion size={18} /></span><span className="report-kpi-label">Next step</span><strong>Ask the seller</strong><small>Get vehicle-specific evidence</small></div>
    </div>

    <nav className="report-section-tabs free-report-tabs" aria-label="Free report sections">
      <a className="active" href="#free-summary"><span>01</span>Summary</a>
      <a href="#free-history"><span>02</span>History</a>
      <a href="#free-meaning"><span>03</span>What it means</a>
      <a href="#free-next-steps"><span>04</span>Next steps</a>
    </nav>

    <div className="report-content">
      <section id="free-history" className="report-block">
        <header className="report-block-heading">
          <div className="report-block-title"><span className="report-block-icon" aria-hidden="true"><History size={20} /></span><div><p className="report-eyebrow">Historical signal</p><h2>Available historical data</h2></div></div>
          <p className="report-block-description">Categories from model-year history that may deserve closer questions and document checks.</p>
        </header>
        <div className="report-history-callout"><Info size={19} /><p>This section describes aggregate historical patterns. It does not prove that this listed vehicle has any of these issues.</p></div>
        {matched && report.topHistoricalAreas.length > 0 ? <div className="report-finding-grid">
          {report.topHistoricalAreas.map((area, index) => <div className="report-finding-card free-historical-card" key={area.name}>
            <div className="free-historical-card-inner"><span className="report-finding-marker">{String(index + 1).padStart(2, "0")}</span><div><h3>{area.name}</h3><p>{area.historicalComplaintCount.toLocaleString("en-CA")} aggregate historical complaints in this category.</p></div></div>
          </div>)}
        </div> : <div className="report-empty-note">More specific model history is not available for this quick check. Continue with the vehicle-specific questions below.</div>}
        {report.headlines.length > 0 && <div className="free-headlines">{report.headlines.map((headline) => <p key={headline}>{headline}</p>)}</div>}
      </section>

      <section id="free-meaning" className="report-block">
        <header className="report-block-heading">
          <div className="report-block-title"><span className="report-block-icon" aria-hidden="true"><Info size={20} /></span><div><p className="report-eyebrow">Interpretation</p><h2>What this means</h2></div></div>
          <p className="report-block-description">Use the historical signal to prioritize verification, never as a verdict.</p>
        </header>
        <div className="report-risk-overview free-meaning-grid">
          <div><span className="report-eyebrow">What it can do</span><strong>Prioritize</strong><p>Help you decide what to ask about first.</p></div>
          <div><span className="report-eyebrow">What it cannot do</span><strong>Diagnose</strong><p>It does not establish this car&apos;s condition.</p></div>
          <div><span className="report-eyebrow">What comes next</span><strong>Verify</strong><p>Request records and an independent inspection.</p></div>
        </div>
        {report.lockedSummary?.additionalHistoricalDetailAvailable && <div className="free-upgrade-note"><Target size={18} /><p>Additional historical detail is available in a future full report.</p><Link href="/check?step=choose">Explore report options <ArrowRight size={15} /></Link></div>}
      </section>

      <section id="free-next-steps" className="report-block report-block-actions">
        <header className="report-block-heading">
          <div className="report-block-title"><span className="report-block-icon" aria-hidden="true"><MessageCircleQuestion size={20} /></span><div><p className="report-eyebrow">Before you arrange a visit</p><h2>Questions for the seller</h2></div></div>
          <p className="report-block-description">Keep the answers with this vehicle record and compare them with the documents.</p>
        </header>
        <ol className="report-question-list">{visitQuestions.map((question, index) => <li key={question}><span>{String(index + 1).padStart(2, "0")}</span><p>{question}</p></li>)}</ol>
      </section>

      <section className="report-final-card free-upgrade-card">
        <div><p className="report-eyebrow">The model is only part of the story</p><h2>Prepare for this specific listing.</h2><p>Get rules-based listing concerns, seller questions, inspection prompts, and a practical buyer checklist. No additional vehicle history is promised.</p></div>
        <div className="report-final-actions"><Link className="button button-primary" href="/check?step=choose">Explore report options <ArrowRight size={17} /></Link><button className="button button-secondary" type="button" onClick={onRetry}><RefreshCw size={16} /> Try again</button><Link className="button button-secondary" href="/inspection">Prepare an inspection request <ArrowUpRight size={16} /></Link></div>
      </section>

      <section className="report-disclaimer report-disclaimer-card"><div className="report-block-icon" aria-hidden="true"><Info size={19} /></div><div><h2>Know the limits of this quick check.</h2><p>Historical model-year information does not establish the condition, history, ownership, liens, market value, or safety of this specific vehicle. Confirm documents and arrange an independent inspection before buying.</p></div></section>
    </div>
  </article>;
}
