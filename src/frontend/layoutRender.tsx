import type { CSSProperties } from "react";
import type { Fill, LayoutObject } from "./types";

export function fillToCss(fill: Fill | undefined, fallback = "transparent"): string {
  if (!fill) return fallback;
  if (fill.type === "solid") return fill.color;
  if (fill.type === "linear-gradient") return `linear-gradient(145deg, ${fill.from}, ${fill.to})`;
  if (fill.type === "radial-gradient") return `radial-gradient(circle, ${fill.inner}, ${fill.outer})`;
  return fallback;
}

export function objectStyle(object: LayoutObject): CSSProperties {
  return {
    position: "absolute",
    left: object.x,
    top: object.y,
    width: object.width,
    height: object.height,
    opacity: object.opacity,
    zIndex: object.zIndex,
    transform: `rotate(${object.rotation}deg)`,
    transformOrigin: "center center",
    boxSizing: "border-box",
    display: object.visible === false ? "none" : undefined,
  };
}

export function ProductPlaceholder({ label }: { label: string }) {
  return (
    <div className="productBottle">
      <div className="productCap" />
      <div className="productNeck" />
      <div className="productGlass">
        <div className="productLabel">{label}</div>
      </div>
      <div className="productShadow" />
    </div>
  );
}
