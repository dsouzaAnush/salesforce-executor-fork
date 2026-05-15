import type { SalesforceProductLogo } from "@salesforce-executor/docs-index";

type LogoSize = "sm" | "md" | "lg";

const pixelSize: Record<LogoSize, number> = {
  sm: 20,
  md: 40,
  lg: 48,
};

const officialLogoSize: Record<LogoSize, { width: number; height: number; radius: number }> = {
  sm: { width: 32, height: 20, radius: 4 },
  md: { width: 72, height: 40, radius: 6 },
  lg: { width: 96, height: 48, radius: 8 },
};

const baseScale = 0.78;

export function OfficialProductLogo(props: {
  logo: SalesforceProductLogo;
  size?: LogoSize;
  className?: string;
}) {
  const size = props.size ?? "md";
  if (props.logo.presentation === "official-logo") {
    const frame = officialLogoSize[size];
    return (
      <span
        className={[
          "inline-flex shrink-0 items-center justify-center overflow-hidden border border-border/60 bg-white",
          props.className ?? "",
        ].join(" ")}
        style={{
          width: frame.width,
          height: frame.height,
          borderRadius: frame.radius,
        }}
        title={`${props.logo.brand} official logo source: ${props.logo.sourceUrl}`}
      >
        <img
          src={props.logo.src}
          alt={props.logo.alt}
          className="block h-full w-full object-cover"
          style={{ transform: `scale(${props.logo.imageScale ?? 1})` }}
          loading="lazy"
          draggable={false}
        />
      </span>
    );
  }

  const containerSize = pixelSize[size];
  const radius = Math.max(4, Math.round(containerSize * 0.22));
  const glyphSize = Math.round(containerSize * (props.logo.glyphScale ?? baseScale));
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center justify-center overflow-hidden",
        props.className ?? "",
      ].join(" ")}
      style={{
        width: containerSize,
        height: containerSize,
        borderRadius: radius,
        background: props.logo.tileBackground,
      }}
      title={`${props.logo.brand} logo from sf-agent: ${props.logo.sfAgentAsset}; brand reference: ${props.logo.sourceUrl}`}
    >
      <img
        src={props.logo.src}
        alt={props.logo.alt}
        width={glyphSize}
        height={glyphSize}
        className="block object-contain"
        loading="lazy"
        draggable={false}
      />
    </span>
  );
}
