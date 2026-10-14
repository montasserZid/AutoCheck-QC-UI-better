import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { VehicleIntakeFlow } from "@/components/VehicleIntakeFlow";

export const metadata: Metadata = {
  title: "Check a Car — New Prototype",
  description: "A clearer AutoCheck QC vehicle intake prototype.",
};

export default function Check2Page() {
  return (
    <main className="page-shell check2-page">
      <Container>
        <VehicleIntakeFlow prototype />
      </Container>
    </main>
  );
}
