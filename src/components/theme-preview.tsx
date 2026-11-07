import { BackgroundAsset, CharacterAsset } from "@/themes/assets";
import type { ThemeConfig } from "@/themes";
import { themeStyles } from "@/themes/styles";

export function ThemePreview({ theme }: { theme: ThemeConfig }) {
  return <>
    <span className="theme-preview-scene" style={themeStyles(theme)} aria-hidden="true">
      <BackgroundAsset assetId={theme.assets.background} className="theme-preview-background"/>
      <span className="theme-preview-judge"><CharacterAsset assetId={theme.judge.assetId} label={theme.judge.description}/></span>
      <span className="theme-preview-name">{theme.judge.displayName}</span>
    </span>
    <span className="theme-card-copy"><strong>{theme.displayName}</strong><span>{theme.description}</span></span>
  </>;
}
