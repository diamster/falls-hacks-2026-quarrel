import { useId, useMemo } from "react";
import { toPaths } from "./grid";
import { getPixelAsset, renderPixelAsset } from "./roster";
import type { Reaction } from "./types";

/**
 * Renders a pixel asset with the same contract as the existing sprites:
 * a 96 × 112 viewBox, a `.sprite-body` group scaled ×2 and a `.sprite-mouth`
 * group, so the arena's idle and speaking CSS animations apply unchanged.
 */
export function PixelSprite({ assetId, label, className = "", reaction = "idle", frame = 0, accessories }: {
  assetId: string;
  label: string;
  className?: string;
  reaction?: Reaction;
  frame?: number;
  accessories?: boolean;
}) {
  const id = useId();
  const asset = getPixelAsset(assetId);
  const { body, mouth } = useMemo(() => {
    const snapshot = renderPixelAsset(asset, reaction, frame, accessories ?? asset.accessories);
    return { body: toPaths(snapshot, false), mouth: toPaths(snapshot, true) };
  }, [asset, reaction, frame, accessories]);
  return <svg className={className} viewBox="0 0 96 112" fill="none" shapeRendering="crispEdges" role="img" aria-labelledby={id} data-character-asset={asset.assetId} data-pixel-art={asset.kind}>
    <title id={id}>{label}</title>
    <g className="sprite-body"><g transform="scale(2)">
      {body.map(path => <path key={path.key} d={path.d} fill={path.color}/>)}
      <g className="sprite-mouth">{mouth.map(path => <path key={path.key} d={path.d} fill={path.color}/>)}</g>
    </g></g>
  </svg>;
}
