"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  CarFront,
  Check,
  Clipboard,
  FileText,
  Gauge,
  History,
  Info,
  MapPin,
  MessageCircleQuestion,
  Printer,
  ShieldAlert,
  ShieldCheck,
  Target,
  Wrench,
} from "lucide-react";
import type { DemoBuyerReport, ReportFinding, VehicleIntake } from "@/types/domain";
import { listingSourceLabel } from "./dossier/VehicleIdentityPlate";
import { BuyerChecklist } from "./dossier/BuyerChecklist";

function riskTone(level: DemoBuyerReport["riskLevel"]): "low" | "medium" | "high" | "unknown" {
  if (level === "Low") return "low";
  if (level === "Medium") return "medium";
  if (level === "Unknown") return "unknown";
  return "high";
}

function valueFor(report: DemoBuyerReport, label: string) {
  return report.vehicleSummary.find((item) => item.label.toLowerCase() === label.toLowerCase())?.value ?? "Not provided";
}

function StatusChip({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const tone = normalized.includes("yes") || normalized.includes("allowed") || normalized.includes("available")
    ? "positive"
    : normalized.includes("no") || normalized.includes("missing") || normalized.includes("not provided")
      ? "negative"
      : "neutral";
  return <span className={`report-status-chip ${tone}`}>{value}</span>;
}

function FindingCards({ items, tone = "neutral" }: { items: ReportFinding[]; tone?: "neutral" | "danger" | "warning" }) {
  if (!items.length) return <p className="report-empty-note">No additional items were identified from the supplied listing details.</p>;
  return <div className="report-finding-grid">
    {items.map((item, index) => <details className={`report-finding-card ${tone}`} key={`${item.title}-${index}`}>
      <summary>
        <span className="report-finding-marker">{String(index + 1).padStart(2, "0")}</span>
        <span className="report-finding-title">{item.title}</span>
        <span className="report-finding-toggle" aria-hidden="true">+</span>
      </summary>
      <p>{item.detail}</p>
    </details>)}
  </div>;
}

function ReportBlock({ id, eyebrow, title, description, icon, children, className = "" }: {
  id: string;
  eyebrow?: string;
  title: string;
  description?: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return <section id={id} className={`report-block ${className}`}>
    <header className="report-block-heading">
      <div className="report-block-title">
        <span className="report-block-icon" aria-hidden="true">{icon}</span>
        <div>
          {eyebrow && <p className="report-eyebrow">{eyebrow}</p>}
          <h2>{title}</h2>
        </div>
      </div>
      {description && <p className="report-block-description">{description}</p>}
    </header>
    {children}
  </section>;
}

function RiskBar({ label, points, max }: { label: string; points: number; max: number }) {
  const width = Math.max(8, Math.min(100, (points / Math.max(max, 1)) * 100));
  return <div className="report-risk-bar">
    <div className="report-risk-bar-label"><span>{label}</span><strong>+{points}</strong></div>
    <div className="report-risk-track" aria-hidden="true"><span style={{ width: `${width}%` }} /></div>
  </div>;
}

export function ReportView({ report, example = false, vehicle }: { report: DemoBuyerReport; example?: boolean; vehicle?: VehicleIntake }) {
  const free = report.reportType === "free";
  const [copyStatus, setCopyStatus] = useState("");
  const [message, setMessage] = useState(report.sellerMessage);
  const tone = riskTone(report.riskLevel);
  const vehicleName = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ")
    : report.vehicleTitle;
  const sellerDescriptionLabel = report.sellerDescriptionSource === "pasted-section"
    ? "Description section from pasted listing"
    : report.sellerDescriptionSource === "user-edited"
      ? "User-provided listing description"
      : report.sellerDescriptionSource === "unknown"
        ? "Unverified listing text"
        : "Seller's listing description";
  const source = listingSourceLabel(vehicle?.listingUrl, vehicle?.listingSource);
  const price = valueFor(report, "Asking price");
  const riskItems = report.biggestRedFlags.length ? report.biggestRedFlags : report.missingInformation;
  const maxRiskPoints = Math.max(...report.riskContributions.map((item) => item.points), 1);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopyStatus("Message copied.");
    } catch {
      setCopyStatus("Copy was unavailable. Select the message text to copy it.");
    }
  }

  return <article className="report-shell report-aimoove decision-report dossier-report">
    <div className="report-toolbar report-aimoove-toolbar">
      <span>AUTOCHECK / QC <b aria-hidden="true">/</b> {example ? "ILLUSTRATIVE REPORT" : free ? "QUICK CHECK" : "BUYER REPORT"}</span>
      <div>
        <Link className="report-toolbar-link" href={example ? "/check" : "/check?step=choose"}>{example ? "Check your own car" : "Report options"}<ArrowUpRight size={15} /></Link>
        <button className="report-print-button" type="button" title="Print report" aria-label="Print report" onClick={() => window.print()}><Printer size={17} /></button>
      </div>
    </div>

    <header className="report-hero">
      <div className="report-hero-visual" aria-hidden="true"><CarFront size={108} strokeWidth={1.15} /><span>QC / {report.id}</span></div>
      <div className="report-hero-copy">
        <p className="report-eyebrow">Vehicle decision report</p>
        <h1>{vehicleName || "Vehicle details not found"}</h1>
        <p className="report-hero-subtitle">A structured pre-screen of the listing information you supplied. Seller statements remain claims until documents and an independent inspection confirm them.</p>
        <div className="report-hero-meta">
          {vehicle?.year != null && <span><BadgeCheck size={15} /> {vehicle.year}</span>}
          {vehicle?.mileageKm != null && <span><Gauge size={15} /> {new Intl.NumberFormat("en-CA").format(vehicle.mileageKm)} km</span>}
          {(vehicle?.city || vehicle?.location) && <span><MapPin size={15} /> {vehicle.city || vehicle.location}</span>}
          <span><FileText size={15} /> {source}</span>
        </div>
      </div>
      <div className="report-hero-action">
        <span className="report-eyebrow">Report status</span>
        <strong>{example ? "Illustrative" : "Ready to review"}</strong>
        <small>Generated {new Date(report.generatedAt).toLocaleDateString("en-CA")}</small>
        <a className="button button-primary" href="#report-summary">Start with the summary <ArrowRight size={17} /></a>
      </div>
    </header>

    <section id="report-summary" className={`report-verdict report-verdict-${tone}`}>
      <div className="report-verdict-main">
        <div className="report-verdict-mark" aria-label={`${report.riskScore} out of 100 concern score`}><span>{report.riskScore}</span><small>/100</small></div>
        <div>
          <p className="report-eyebrow">AutoCheck concern index</p>
          <h2>{report.finalRecommendation}</h2>
          <p>{report.nextStep}</p>
        </div>
      </div>
      <div className="report-verdict-status">
        <span className="report-status-label">Listing concern level</span>
        <strong>{report.riskLevel}</strong>
        <small>Rules-based uncertainty score. This is not a mechanical grade or failure probability.</small>
      </div>
      <a className="report-verdict-link" href="#report-actions">Plan the next move <ArrowRight size={16} /></a>
    </section>

    <div className="report-kpi-grid" aria-label="Report indicators">
      <div className="report-kpi-card accent-red"><span className="report-kpi-icon"><ShieldAlert size={18} /></span><span className="report-kpi-label">Priority concern</span><strong>{report.topConcern}</strong><small>Resolve before travelling</small></div>
      <div className="report-kpi-card accent-amber"><span className="report-kpi-icon"><Target size={18} /></span><span className="report-kpi-label">Asking price</span><strong>{price}</strong><small>Not independently valued</small></div>
      <div className="report-kpi-card accent-green"><span className="report-kpi-icon"><ShieldCheck size={18} /></span><span className="report-kpi-label">Inspection path</span><strong>{vehicle?.inspectionAllowed === "yes" ? "Allowed" : "Needs confirmation"}</strong><small>Professional verification remains essential</small></div>
      <div className="report-kpi-card accent-slate"><span className="report-kpi-icon"><MessageCircleQuestion size={18} /></span><span className="report-kpi-label">Open questions</span><strong>{report.missingInformation.length}</strong><small>Information gaps to close</small></div>
    </div>

    <nav className="report-section-tabs" aria-label="Report sections">
      <a className="active" href="#report-summary"><span>01</span>Summary</a>
      <a href="#report-history"><span>02</span>History</a>
      <a href="#report-risks"><span>03</span>Risks</a>
      <a href="#report-market"><span>04</span>Market &amp; price</a>
      <a href="#report-questions"><span>05</span>Questions</a>
      <a href="#report-actions"><span>06</span>Next moves</a>
    </nav>

    <div className="report-content">
      <ReportBlock id="report-history" eyebrow="Vehicle evidence" title="History & verification" description="A clear view of what the listing says, what is still missing, and what must be checked in person." icon={<History size={20} />}>
        <div className="report-history-callout"><Info size={19} /><p>AutoCheck organizes supplied information; it does not authenticate vehicle history, liens, ownership, condition, or seller claims.</p></div>
        <div className="report-verification-grid">
          {report.vehicleSummary.map((item) => <div className="report-verification-row" key={item.label}><span>{item.label}</span><StatusChip value={item.value} /></div>)}
        </div>
      </ReportBlock>

      <ReportBlock id="report-risks" eyebrow="What needs attention" title="Risks & open issues" description="Use these cards as a verification plan. A flagged item is not a confirmed defect." icon={<AlertTriangle size={20} />} className="report-block-risk">
        <div className="report-risk-overview">
          <div><span className="report-eyebrow">Risk drivers</span><strong>{report.riskContributions.length}</strong><p>signals contributed to the concern index</p></div>
          <div><span className="report-eyebrow">Highest signal</span><strong>{report.riskContributions[0]?.points ?? 0} pts</strong><p>{report.riskContributions[0]?.label ?? "No explicit concern identified"}</p></div>
          <div><span className="report-eyebrow">Decision rule</span><strong>{report.riskLevel}</strong><p>Keep the purchase conditional on verification.</p></div>
        </div>
        {report.riskContributions.length > 0 && <div className="report-risk-bars">{report.riskContributions.map((item) => <RiskBar key={item.label} label={item.label} points={item.points} max={maxRiskPoints} />)}</div>}
        <h3 className="report-subheading"><ShieldAlert size={17} /> Findings to resolve</h3>
        <FindingCards items={riskItems} tone="danger" />
      </ReportBlock>

      <ReportBlock id="report-market" eyebrow="Price context" title="Market & price" description="The asking price is a starting point for questions, not an independent valuation." icon={<Target size={20} />}>
        <div className="report-market-grid">
          <div className="report-price-card"><span className="report-eyebrow">Seller asking price</span><strong>{price}</strong><p>No live comparables or completed-sale data have been checked for this listing.</p><span className="report-price-badge">Needs independent context</span></div>
          <div className="report-market-method"><h3>How to put it in context</h3><ol><li><span>01</span>Compare similar year, trim, mileage, and location.</li><li><span>02</span>Separate asking prices from verified condition and service history.</li><li><span>03</span>Use written inspection findings before discussing a price.</li></ol></div>
        </div>
        <FindingCards items={report.priceCheck} tone="warning" />
      </ReportBlock>

      <ReportBlock id="report-questions" eyebrow="Before you visit" title="Questions for the seller" description="Send these questions first and keep the answers with the vehicle record." icon={<MessageCircleQuestion size={20} />}>
        <ol className="report-question-list">{(free ? report.sellerQuestions.slice(0, 3) : report.sellerQuestions).map((question, index) => <li key={question}><span>{String(index + 1).padStart(2, "0")}</span><p>{question}</p></li>)}</ol>
      </ReportBlock>

      {report.sellerDescription?.trim() && <ReportBlock id="seller-description" eyebrow="Listing text · unverified" title={sellerDescriptionLabel} description="This text is included as supplied or extracted. It has not been independently verified." icon={<FileText size={20} />} className="report-seller-description">
        <p className="report-seller-description-body">{report.sellerDescription}</p>
      </ReportBlock>}

      <ReportBlock id="report-actions" eyebrow="Your inspection plan" title="Next moves" description="Turn the report into a practical visit plan without treating the listing as verified." icon={<Wrench size={20} />} className="report-block-actions">
        <div className="report-action-grid">
          <div className="report-action-card"><div className="report-action-card-heading"><span><CarFront size={18} /></span><h3>At the vehicle</h3></div><BuyerChecklist items={report.inPersonChecks} label="BUYER CHECKLIST" /></div>
          <div className="report-action-card"><div className="report-action-card-heading"><span><FileText size={18} /></span><h3>For the inspector</h3></div><FindingCards items={report.inspectorFocus} /></div>
        </div>
        <div className="report-action-split">
          <div><h3>What could cost you money</h3><FindingCards items={report.potentialCosts} tone="warning" /></div>
          <div><h3>Negotiation points</h3><FindingCards items={report.negotiationPoints} /></div>
        </div>
      </ReportBlock>

      {!free && <ReportBlock id="seller-message" eyebrow="Ready to send" title="Seller message" description="Edit the draft, then copy it into your preferred message channel." icon={<Clipboard size={20} />}>
        <div className="seller-message report-message-card"><label htmlFor="buyer-message">Make it your own before sending</label><textarea id="buyer-message" rows={9} value={message} onChange={(event) => { setMessage(event.target.value); setCopyStatus(""); }} /><p className="print-message">{message}</p><button className="button button-secondary" type="button" onClick={copy}>{copyStatus === "Message copied." ? <Check size={17} /> : <Clipboard size={17} />}Copy message</button><span role="status" className="copy-feedback">{copyStatus}</span></div>
      </ReportBlock>}

      <section className="report-final-card">
        <div><p className="report-eyebrow">Expert-style conclusion</p><h2>{report.finalRecommendation}</h2><p>{report.inspectionRecommendation}</p></div>
        <div className="report-final-actions"><Link className="button button-primary" href={report.finalRecommendation === "Avoid" ? "#report-questions" : "/inspection"}>{report.finalRecommendation === "Avoid" ? "Resolve the open questions" : "Prepare an inspection request"}<ArrowUpRight size={17} /></Link><Link className="button button-secondary" href="/check?new=1">Check another car</Link></div>
      </section>

      <section className="report-disclaimer report-disclaimer-card"><div className="report-block-icon" aria-hidden="true"><Info size={19} /></div><div><h2>Know the limits of this report.</h2><p>{report.disclaimer}</p></div></section>
    </div>
  </article>;
}
