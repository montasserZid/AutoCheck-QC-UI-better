"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, MoveHorizontal, Plus } from "lucide-react";
import styles from "./home2.module.css";

const topics = [
  {
    number: "01",
    name: "Engine & drivetrain",
    short: "Engine",
    x: 61,
    y: 59,
    prompt: "A polished photograph cannot describe how the vehicle runs.",
    questions: ["Are service records available?", "Are there leaks, noises, or warning lights?", "Can a professional inspect it before purchase?"],
  },
  {
    number: "02",
    name: "Transmission",
    short: "Transmission",
    x: 50,
    y: 68,
    prompt: "A test drive and maintenance history can reveal what an ad leaves out.",
    questions: ["Does it shift smoothly in every gear?", "Is transmission service documented?", "Are there any reported slipping or delays?"],
  },
  {
    number: "03",
    name: "Body & structure",
    short: "Body",
    x: 75,
    y: 50,
    prompt: "Clean paint is visible. The history behind it takes more work.",
    questions: ["Can the seller provide a vehicle history report?", "Do panel gaps and paint match in person?", "Has corrosion or past repair been disclosed?"],
  },
  {
    number: "04",
    name: "Suspension & brakes",
    short: "Brakes",
    x: 77,
    y: 78,
    prompt: "The parts that stop and support a car deserve a closer look.",
    questions: ["Are there noises over bumps or while braking?", "When were wear items last replaced?", "Can an inspector check underneath?"],
  },
  {
    number: "05",
    name: "Electronics",
    short: "Electronics",
    x: 52,
    y: 43,
    prompt: "Equipment shown in a listing should be tried, not assumed.",
    questions: ["Do all controls and displays work?", "Are any warning lights present?", "Are both keys and manuals included?"],
  },
] as const;

const stages = [
  { n: "01", title: "The listing", detail: "Start with the ad you found. Import a URL or provide the details yourself.", tag: "SOURCE MATERIAL", content: "A seller's description is a starting point." },
  { n: "02", title: "Structured information", detail: "Bring vehicle details into a readable view and correct anything the listing got wrong.", tag: "ORGANIZED DETAILS", content: "Year · make · model · mileage · asking price" },
  { n: "03", title: "Evidence review", detail: "Keep seller statements separate from information you can substantiate.", tag: "SOURCE DISTINCTION", content: "Claimed / documented / still unknown" },
  { n: "04", title: "Open questions", detail: "See the gaps worth resolving with the seller or a professional inspector.", tag: "BUYER QUESTIONS", content: "What would change your decision?" },
  { n: "05", title: "Your decision", detail: "Use the report and inspection guidance to choose a more informed next step.", tag: "NEXT STEP", content: "Ask. Verify. Inspect. Decide." },
] as const;

export function Home2Experience() {
  const rootRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const [split, setSplit] = useState(54);
  const [activeTopic, setActiveTopic] = useState(0);
  const [activeStage, setActiveStage] = useState(0);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const elements = root.querySelectorAll<HTMLElement>("[data-home2-reveal]");
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add(styles.visible);
          observer.unobserve(entry.target);
        }
      }),
      { threshold: 0.13, rootMargin: "0px 0px -5% 0px" },
    );
    root.classList.add(styles.ready);
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  function moveHero(event: React.PointerEvent<HTMLElement>) {
    if (event.pointerType === "touch" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    heroRef.current?.style.setProperty("--hero-x", `${x * -18}px`);
    heroRef.current?.style.setProperty("--hero-y", `${y * -12}px`);
  }

  function resetHero() {
    heroRef.current?.style.setProperty("--hero-x", "0px");
    heroRef.current?.style.setProperty("--hero-y", "0px");
  }

  const currentTopic = topics[activeTopic];
  const currentStage = stages[activeStage];

  return (
    <main className={styles.home2} ref={rootRef}>
      <section className={styles.hero} ref={heroRef} onPointerMove={moveHero} onPointerLeave={resetHero} aria-labelledby="home2-title">
        <div className={styles.heroImage} aria-hidden="true">
          <Image src="/home2/honda-fog.jpg" alt="" fill priority sizes="100vw" />
        </div>
        <div className={styles.heroShade} aria-hidden="true" />
        <div className={styles.heroTopline}>
          <span>AUTOCHECK QC / THE BUYER&apos;S PERSPECTIVE</span>
          <span>MONTRÉAL · QUÉBEC</span>
        </div>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>01 / LOOK BEYOND THE LISTING</p>
          <h1 id="home2-title">Know the car<br />before you <em>buy.</em></h1>
          <p className={styles.heroLead}>A beautiful listing only shows you what the seller chose to show. Look closer at the evidence, the unknowns, and the questions that matter.</p>
          <Link className={styles.primaryLink} href="/check">Check a vehicle <ArrowUpRight size={19} aria-hidden="true" /></Link>
        </div>
        <div className={styles.heroBottom}>
          <span>SCROLL TO LOOK CLOSER</span>
          <ArrowDown size={19} aria-hidden="true" />
          <span>PHOTOGRAPHY IS NOT PROOF</span>
        </div>
      </section>

      <section className={styles.thesis} aria-label="The thought behind AutoCheck QC">
        <div className={styles.thesisLine} data-home2-reveal>
          <span className={styles.sectionIndex}>THE IDEA / 01</span>
          <p>What you see <span>is only the beginning.</span></p>
        </div>
        <div className={styles.thesisFoot} data-home2-reveal>
          <span>THE ADVERTISEMENT</span>
          <span className={styles.thesisRule} aria-hidden="true" />
          <span>THE INVESTIGATION</span>
        </div>
      </section>

      <section className={styles.revealSection} aria-labelledby="reveal-title">
        <div className={styles.sectionHead} data-home2-reveal>
          <p className={styles.kicker}>02 / BEYOND THE ADVERTISEMENT</p>
          <h2 id="reveal-title">There is always<br /><em>more to ask.</em></h2>
          <p>Move the line. The same photograph can tell two very different stories.</p>
        </div>
        <div className={styles.comparison} style={{ "--split": `${split}%` } as React.CSSProperties} data-home2-reveal>
          <div className={styles.comparisonPhoto}>
            <Image src="/home2/honda-fog.jpg" alt="A grey sedan photographed on a foggy road" fill sizes="(max-width: 700px) 100vw, 90vw" />
          </div>
          <div className={styles.comparisonOverlay} aria-hidden="true">
            <div className={styles.comparisonTint} />
            <div className={styles.measureLineOne} />
            <div className={styles.measureLineTwo} />
            <div className={`${styles.photoNote} ${styles.noteOne}`}><i />SERVICE HISTORY <strong>Ask for records</strong></div>
            <div className={`${styles.photoNote} ${styles.noteTwo}`}><i />VEHICLE HISTORY <strong>Confirm independently</strong></div>
            <div className={`${styles.photoNote} ${styles.noteThree}`}><i />CONDITION <strong>Arrange an inspection</strong></div>
          </div>
          <div className={styles.compareLabelLeft}>WHAT YOU SEE <span>01 / THE LISTING</span></div>
          <div className={styles.compareLabelRight}>WHAT YOU NEED TO KNOW <span>02 / THE QUESTIONS</span></div>
          <div className={styles.splitLine} aria-hidden="true"><span><MoveHorizontal size={22} /></span></div>
          <input className={styles.compareRange} type="range" min="15" max="85" value={split} onChange={(event) => setSplit(Number(event.target.value))} aria-label="Reveal questions behind the vehicle listing photograph" />
          <span className={styles.comparisonCaption}>ILLUSTRATIVE QUESTIONS · NO CONDITION CLAIMS ABOUT THE PHOTOGRAPHED CAR</span>
        </div>
        <p className={styles.revealNote} data-home2-reveal><span>THE DIFFERENCE</span> A claim is a place to start. Documentation and inspection can help you decide what to trust.</p>
      </section>

      <section className={styles.investigation} aria-labelledby="investigation-title">
        <div className={styles.investigationIntro} data-home2-reveal>
          <p className={styles.kicker}>03 / INVESTIGATION MODE</p>
          <h2 id="investigation-title">Look beyond<br /><em>the surface.</em></h2>
          <p>Select an area to see the questions a buyer can bring to a seller or inspector.</p>
          <span>INTERACTIVE DEMONSTRATION · NOT A VEHICLE ASSESSMENT</span>
        </div>
        <div className={styles.investigationGrid} data-home2-reveal>
          <div className={styles.inspectVisual}>
            <Image src="/home2/silver-sedan.jpg" alt="Silver sedan parked beneath a city structure at sunset" fill sizes="(max-width: 900px) 100vw, 60vw" />
            <div className={styles.inspectScrim} aria-hidden="true" />
            <div className={styles.inspectCrosshair} aria-hidden="true" />
            <div className={styles.inspectVisualTop}><span>AREA / {currentTopic.number}</span><span>EXPLORE THE VEHICLE</span></div>
            {topics.map((topic, index) => (
              <button key={topic.number} className={`${styles.hotspot} ${activeTopic === index ? styles.hotspotActive : ""}`} style={{ left: `${topic.x}%`, top: `${topic.y}%` }} type="button" aria-label={`Explore ${topic.name}`} aria-pressed={activeTopic === index} onClick={() => setActiveTopic(index)}>
                <Plus size={18} strokeWidth={1.7} aria-hidden="true" />
                <span>{topic.short}</span>
              </button>
            ))}
            <div className={styles.inspectVisualBottom}>SELECT A MARKER <span>{"///"}</span> ASK BETTER QUESTIONS</div>
          </div>
          <div className={styles.inspectPanel}>
            <div className={styles.topicList} role="group" aria-label="Vehicle areas to investigate">
              {topics.map((topic, index) => (
                <button key={topic.number} className={activeTopic === index ? styles.topicActive : ""} type="button" aria-pressed={activeTopic === index} onClick={() => setActiveTopic(index)}>
                  <span>{topic.number}</span><strong>{topic.name}</strong><ArrowUpRight size={16} aria-hidden="true" />
                </button>
              ))}
            </div>
            <div className={styles.topicDetail} key={currentTopic.number} aria-live="polite">
              <span className={styles.detailEyebrow}>QUESTIONS TO INVESTIGATE / {currentTopic.number}</span>
              <h3>{currentTopic.name}</h3>
              <p>{currentTopic.prompt}</p>
              <ul>{currentTopic.questions.map((question) => <li key={question}>{question}</li>)}</ul>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.workflow} aria-labelledby="workflow-title">
        <div className={styles.workflowTop} data-home2-reveal>
          <div><p className={styles.kicker}>04 / FROM LISTING TO EVIDENCE</p><h2 id="workflow-title">The ad becomes<br /><em>a clearer picture.</em></h2></div>
          <p>AutoCheck QC organizes what a listing says, makes uncertainty visible, and helps you prepare the next question.</p>
        </div>
        <div className={styles.workflowGrid} data-home2-reveal>
          <div className={styles.stageList} role="group" aria-label="Explore the AutoCheck QC workflow">
            {stages.map((stage, index) => (
              <button key={stage.n} className={`${styles.stageButton} ${activeStage === index ? styles.stageActive : ""}`} type="button" aria-pressed={activeStage === index} onClick={() => setActiveStage(index)}>
                <span>{stage.n}</span><strong>{stage.title}</strong><ArrowUpRight size={18} aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className={styles.dossier}>
            <div className={styles.dossierTop}><span>AUTOCHECK QC</span><span>BUYER&apos;S DOSSIER / DEMO</span></div>
            <div className={styles.dossierImage}><Image src="/home2/dashboard.jpg" alt="Close view of a real vehicle dashboard" fill sizes="(max-width: 900px) 100vw, 40vw" /></div>
            <div className={styles.dossierBody} key={currentStage.n} aria-live="polite">
              <div className={styles.dossierCounter}><span>0{activeStage + 1} / 05</span><span>{currentStage.tag}</span></div>
              <h3>{currentStage.title}</h3>
              <p className={styles.dossierSample}>{currentStage.content}</p>
              <p className={styles.dossierDetail}>{currentStage.detail}</p>
              <div className={styles.dossierProgress} aria-hidden="true"><span style={{ width: `${(activeStage + 1) * 20}%` }} /></div>
            </div>
            <div className={styles.dossierFoot}><span>EXAMPLE PROCESS ONLY</span><span>NOT AN INSPECTION RECORD</span></div>
          </div>
        </div>
        <div className={styles.workflowBottom} data-home2-reveal><span>LISTING IN</span><span className={styles.flowArrow} aria-hidden="true" /><span>BETTER QUESTIONS OUT</span></div>
      </section>

      <section className={styles.finalSection} aria-labelledby="final-title">
        <div className={styles.finalImage} aria-hidden="true"><Image src="/home2/dark-profile.jpg" alt="" fill sizes="(max-width: 700px) 100vw, 55vw" /></div>
        <div className={styles.finalContent} data-home2-reveal>
          <p className={styles.kicker}>05 / A MORE CONFIDENT NEXT STEP</p>
          <h2 id="final-title">Know more<br />before <em>you decide.</em></h2>
          <p>The next car you consider deserves more than a glance. Start with the listing and see what needs a closer look.</p>
          <Link className={styles.finalLink} href="/check">Check a vehicle <ArrowRight size={20} aria-hidden="true" /></Link>
          <div className={styles.finalLinks}><Link href="/example-report">Explore an example report <ArrowUpRight size={15} aria-hidden="true" /></Link><Link href="/inspection">Prepare an inspection <ArrowUpRight size={15} aria-hidden="true" /></Link></div>
        </div>
        <div className={styles.finalMark}>AUTOCHECK QC / KNOW MORE. BUY BETTER.</div>
      </section>
    </main>
  );
}
