"use client";

import { useState } from "react";
import Image from "next/image";
import { resolveVehicleImage, type VehicleImageInput } from "@/lib/vehicle-image-resolver";

export function VehicleImage({ make, model, year, bodyType, className, sizes = "(max-width: 680px) 100vw, 240px" }: VehicleImageInput & {
  className?: string;
  sizes?: string;
}) {
  const match = resolveVehicleImage({ make, model, year, bodyType });
  const [failed, setFailed] = useState(false);
  if (!match || failed) return null;

  const vehicleName = [year, make, model].filter(Boolean).join(" ");
  const description = match.matchType === "model"
    ? `${vehicleName} representative illustration`
    : `${make} ${match.bodyType} representative illustration`;

  return <Image
    className={className}
    src={match.src}
    alt={description}
    width={500}
    height={320}
    unoptimized
    loading="lazy"
    decoding="async"
    sizes={sizes}
    onError={() => setFailed(true)}
  />;
}
