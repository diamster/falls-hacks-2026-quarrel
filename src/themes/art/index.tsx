import { useId } from "react";
import type { ComponentType } from "react";
import { characterArt } from "./characters";
import { SuperheroBackground, DetectiveBackground, CourtroomBackground } from "./backgrounds";
import { SuperheroBench, DetectiveBench, CourtroomBench } from "./benches";

export type NewEnvironmentAssetId = "superhero" | "detective" | "courtroom";
export const newCharacterAssetIds = Object.keys(characterArt);

const backgrounds: Record<NewEnvironmentAssetId, ComponentType> = {
  superhero: SuperheroBackground,
  detective: DetectiveBackground,
  courtroom: CourtroomBackground,
};
const benches: Record<NewEnvironmentAssetId, ComponentType> = {
  superhero: SuperheroBench,
  detective: DetectiveBench,
  courtroom: CourtroomBench,
};

/** Pure asset renderers: theme/character selection belongs in the theme registry. */
export function ThemeBackground({ assetId, className = "" }: { assetId: NewEnvironmentAssetId; className?: string }) {
  const Background = backgrounds[assetId];
  return <svg className={className} viewBox="0 0 960 440" preserveAspectRatio="xMidYMid slice" fill="none" shapeRendering="crispEdges" aria-hidden="true" data-background-asset={assetId}>
    <Background/>
  </svg>;
}

export function ThemeBench({ assetId, className = "" }: { assetId: NewEnvironmentAssetId; className?: string }) {
  const Bench = benches[assetId];
  return <svg className={className} viewBox="0 0 192 92" fill="none" shapeRendering="crispEdges" aria-hidden="true" data-bench-asset={assetId}><Bench/></svg>;
}

export function ThemeCharacterSprite({ assetId, label, className = "" }: { assetId: string; label: string; className?: string }) {
  const id = useId();
  const Sprite = Object.hasOwn(characterArt, assetId) ? characterArt[assetId] : characterArt["superhero-scout"];
  return <svg className={className} viewBox="0 0 96 112" fill="none" shapeRendering="crispEdges" role="img" aria-labelledby={id} data-character-asset={assetId}>
    <title id={id}>{label}</title>
    <path d="M22 106H76V108H82V110H16V108H22Z" fill="#202020" opacity=".22"/>
    <g className="sprite-body"><Sprite/></g>
  </svg>;
}
