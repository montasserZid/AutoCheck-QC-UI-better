import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveVehicleImage } from "../src/lib/vehicle-image-resolver";

describe("resolveVehicleImage", () => {
  it("prefers exact model illustrations and normalizes names", () => {
    assert.deepEqual(resolveVehicleImage({ make: "HONDA", model: " Civic " }), { src: "/vehicles/honda/civic.webp", matchType: "model" });
    assert.equal(resolveVehicleImage({ make: "Toyota", model: "Corolla" })?.src, "/vehicles/toyota/corolla.webp");
    assert.equal(resolveVehicleImage({ make: "VW", model: "Golf" })?.src, "/vehicles/volkswagen/golf.webp");
    assert.equal(resolveVehicleImage({ make: "\u0160koda", model: "Octavia" })?.src, "/vehicles/skoda/octavia.webp");
    assert.equal(resolveVehicleImage({ make: "Dodge", model: "Grand-Caravan" })?.src, "/vehicles/dodge/minivan.webp");
  });

  it("uses verified body-type fallbacks", () => {
    const cases = [["Dodge", "Grand Caravan", "/vehicles/dodge/minivan.webp", "minivan"], ["Ford", "Transit", "/vehicles/ford/van.webp", "van"], ["BMW", "X3", "/vehicles/bmw/suv.webp", "suv"], ["GMC", "Sierra 1500", "/vehicles/gmc/pickup.webp", "pickup"], ["Toyota", "Sienna", "/vehicles/toyota/minivan.webp", "minivan"], ["Chevrolet", "Express", "/vehicles/chevrolet/van.webp", "van"]] as const;
    for (const [make, model, src, bodyType] of cases) assert.deepEqual(resolveVehicleImage({ make, model }), { src, matchType: "bodyType", bodyType });
  });

  it("returns null without a suitable match", () => {
    assert.equal(resolveVehicleImage({ make: "Unknown", model: "Mystery" }), null);
    assert.equal(resolveVehicleImage({ make: "Honda", model: "Mystery" }), null);
    assert.equal(resolveVehicleImage({ make: "Honda", model: "Mystery", bodyType: "spaceship" }), null);
    assert.equal(resolveVehicleImage({ make: "Honda", model: "Mystery" }), null);
    assert.equal(resolveVehicleImage({ make: "Honda", model: "Mystery", bodyType: "SUV" })?.src, "/vehicles/honda/suv.webp");
  });
});
