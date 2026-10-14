import type { Metadata } from "next";
import { Home2Experience } from "./Home2Experience";

export const metadata: Metadata = {
  title: "Look Beyond the Listing — Home Experiment",
  description:
    "An editorial look at how AutoCheck QC helps used-car buyers turn a listing into clearer questions and next steps.",
  robots: { index: false, follow: false },
};

export default function Home2Page() {
  return <Home2Experience />;
}
