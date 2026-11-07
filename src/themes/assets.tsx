import type { ComponentType } from "react";
import { CharacterSprite, JungleBackdrop, JudgeBench } from "@/components/pixel-art";
import { ThemeBackground, ThemeBench, ThemeCharacterSprite, newCharacterAssetIds } from "./art";
import type { ThemeId } from "./types";

type AssetProps = { className?: string };
const backgrounds: Record<ThemeId, ComponentType<AssetProps>> = {
  jungle: JungleBackdrop,
  superhero: props => <ThemeBackground assetId="superhero" {...props}/>,
  detective: props => <ThemeBackground assetId="detective" {...props}/>,
  courtroom: props => <ThemeBackground assetId="courtroom" {...props}/>,
};
const benches: Record<ThemeId, ComponentType<AssetProps>> = {
  jungle: JudgeBench,
  superhero: props => <ThemeBench assetId="superhero" {...props}/>,
  detective: props => <ThemeBench assetId="detective" {...props}/>,
  courtroom: props => <ThemeBench assetId="courtroom" {...props}/>,
};
const legacySprites: Record<string, ComponentType<AssetProps>> = {
  lion: props => <CharacterSprite character="lion" {...props}/>,
  zebra: props => <CharacterSprite character="zebra" {...props}/>,
  lemur: props => <CharacterSprite character="lemur" {...props}/>,
};
const originalAssets = new Set<string>(newCharacterAssetIds);

export function BackgroundAsset({ assetId, className }: AssetProps & { assetId: ThemeId }) {
  const Background = backgrounds[assetId];
  return <Background className={className}/>;
}
export function BenchAsset({ assetId }: { assetId: ThemeId }) {
  const Bench = benches[assetId];
  return <Bench/>;
}
export function CharacterAsset({ assetId, label, className }: AssetProps & { assetId: string; label: string }) {
  if (Object.hasOwn(legacySprites, assetId)) {
    const Sprite = legacySprites[assetId];
    return <Sprite className={className}/>;
  }
  return <ThemeCharacterSprite assetId={originalAssets.has(assetId) ? assetId : "superhero-scout"} label={label} className={className}/>;
}
