import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyIntake, extractListing, extractSellerDescriptionSection, mergeExtractedIntake } from "../src/lib/listingExtraction";
import { extractListingFromHtml } from "../src/lib/listingUrlExtraction";
import { extractFacebookListingFromRenderedText } from "../src/server/listing/facebook";
import { generateDemoReport } from "../src/lib/reportEngine";
import { toFinalizedIntake } from "../src/lib/finalizedIntake";

test("uses genuine vehicle structured data for the seller description", () => {
  const extraction = extractListingFromHtml(
    `<script type="application/ld+json">{"@type":"Vehicle","name":"2019 Honda Civic","description":"Original owner. Service records included.","brand":"Honda","model":"Civic"}</script>`,
    "https://dealer.example/listing/1",
  );
  assert.equal(extraction.details.sellerDescription, "Original owner. Service records included.");
  assert.equal(extraction.provenance.sellerDescription?.source, "json-ld");
});

test("extracts a multiline Kijiji source-specific description and strips HTML safely", () => {
  const extraction = extractListingFromHtml(
    `<title>2019 Honda Civic</title><section data-testid="vip-ad-description"><p>Original owner &amp; clean title.</p><p>Includes winter tires.<br>Service records included.</p><script>ignore()</script></section>`,
    "https://www.kijiji.ca/v-cars-trucks/montreal/2019-honda-civic/123",
  );
  assert.equal(extraction.details.sellerDescription, "Original owner & clean title.\nIncludes winter tires.\nService records included.");
  assert.equal(extraction.provenance.sellerDescription?.source, "html");
});

test("keeps generic metadata separate and does not promote it to seller text", () => {
  const extraction = extractListingFromHtml(
    `<title>2022 Hyundai Elantra Preferred</title><meta property="og:description" content="Find your next car. $21,995 · 82,300 km. Laval.">`,
    "https://dealer.example/elantra",
  );
  assert.equal(extraction.details.sellerDescription, undefined);
  assert.equal(extraction.metadataDescription, "Find your next car. $21,995 · 82,300 km. Laval.");
  assert.equal(extraction.metadataDescriptionProvenance?.source, "meta");
});

test("Facebook rendered extraction keeps the seller section separate from Open Graph preview text", () => {
  const extraction = extractFacebookListingFromRenderedText({
    bodyText: `2021 Honda Civic EX
CA$18,500
Seller's description
One owner.
Service records included.
See more
Exterior colour: White
Montreal, QC · Location is approximate`,
    canonicalUrl: "https://www.facebook.com/marketplace/item/123/",
    finalUrl: "https://www.facebook.com/marketplace/item/123/",
    itemId: "123",
    title: "2021 Honda Civic EX",
    ogTitle: "2021 Honda Civic EX",
    ogDescription: "Driven 82,300 km · View more cars from this seller.",
  });
  assert.equal(extraction.details.sellerDescription, "One owner.\nService records included.");
  assert.equal(extraction.provenance.sellerDescription?.source, "facebook-rendered");
  assert.equal(extraction.metadataDescription, "Driven 82,300 km · View more cars from this seller.");
  assert.doesNotMatch(extraction.details.sellerDescription ?? "", /Driven 82,300/);
});

test("pasted listing text only becomes a description when it has an explicit seller-description heading", () => {
  const pasted = `2018 Toyota Corolla LE · $18,900 · 126,400 km
Seller's description:
One owner. No accidents.
Winter tires included.
See more
Location: Montreal`;
  assert.equal(extractSellerDescriptionSection(pasted), "One owner. No accidents.\nWinter tires included.");
  const extracted = extractListing(pasted);
  assert.equal(extracted.details.sellerDescription, "One owner. No accidents.\nWinter tires included.");
  assert.equal(extracted.found.includes("sellerDescription"), true);
});

test("ambiguous pasted listing content stays raw and is not represented as seller text", () => {
  const pasted = "2018 Toyota Corolla LE. $18,900, 126,400 km. Seller says service records are available.";
  const extracted = extractListing(pasted);
  assert.equal(extractSellerDescriptionSection(pasted), "");
  assert.equal(extracted.details.sellerDescription, undefined);
  assert.equal(extracted.found.includes("sellerDescription"), false);
});

test("blank extraction cannot replace an existing valid seller description", () => {
  const current = { ...emptyIntake, sellerDescription: "Seller's original text.", sellerDescriptionSource: "html" as const };
  const merged = mergeExtractedIntake(current, { sellerDescription: "" });
  assert.equal(merged.sellerDescription, "Seller's original text.");
  assert.equal(merged.sellerDescriptionSource, "html");
});

test("user-edited description survives subsequent field edits and intake navigation merges", () => {
  const current = {
    ...emptyIntake,
    sellerDescription: "My corrected listing text.",
    sellerDescriptionSource: "user-edited" as const,
  };
  const withMileage = mergeExtractedIntake(current, { mileageKm: 82300, sellerDescription: "lower confidence text" });
  const returnedToReview = mergeExtractedIntake(withMileage, {});
  assert.equal(returnedToReview.sellerDescription, "My corrected listing text.");
  assert.equal(returnedToReview.sellerDescriptionSource, "user-edited");
});

test("report carries the seller description separately from generated buyer inquiry", () => {
  const intake = {
    ...emptyIntake,
    make: "Honda",
    model: "Civic",
    year: 2019,
    sellerDescription: "One owner. Service records included.",
    sellerDescriptionSource: "html" as const,
  };
  const report = generateDemoReport(intake, "full");
  assert.equal(report.sellerDescription, intake.sellerDescription);
  assert.equal(report.sellerDescriptionSource, "html");
  assert.match(report.sellerMessage, /^Hi, I'm interested/);
  assert.doesNotMatch(report.sellerMessage, /One owner/);
});

test("client-only provenance and metadata are omitted from the strict intake finalize payload", () => {
  const intake = {
    ...emptyIntake,
    make: "Honda",
    model: "Civic",
    sellerDescription: "Original words.",
    sellerDescriptionSource: "facebook-rendered" as const,
    metadataDescription: "SEO preview.",
    metadataDescriptionSource: "facebook-metadata" as const,
  };
  const finalized = toFinalizedIntake(intake) as Record<string, unknown>;
  assert.equal(finalized.sellerDescription, "Original words.");
  assert.equal("sellerDescriptionSource" in finalized, false);
  assert.equal("metadataDescription" in finalized, false);
});
