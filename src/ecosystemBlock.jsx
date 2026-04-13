import React from "react";
import EcosystemCard from "./ecosystemCard";
import EcosystemBanner from "./ecosystemBanner";

export default function EcosystemBlock({
  isMobile,
  handleEcosystemClick,
  ElectroSwap,
  PlanetZephyrosAE,
  VerdantKinBanner,
  VerdantQueenBanner,
  AetherScionsBanner,
}) {
  const ecosystemItems = [
    {
      type: "card",
      linkKey: "electroswap",
      label: "Buy CORE",
      alt: "Buy CORE",
      imageSrc: ElectroSwap,
      url: "https://app.electroswap.io/explore/tokens/electroneum/0x309b916b3a90cb3e071697ea9680e9217a30066f?inputCurrency=ETN",
    },
    {
      type: "card",
      linkKey: "website",
      label: "Planet ETN",
      alt: "Planet ETN",
      videoSrc: PlanetZephyrosAE,
      url: "https://planetetn.org/zephyros",
    },
    {
      type: "banner",
      linkKey: "vkin",
      alt: "Verdant Kin",
      imageSrc: VerdantKinBanner,
      objectFit: "contain",
      url: "https://app.electroswap.io/nfts/collection/0x3fc7665B1F6033FF901405CdDF31C2E04B8A2AB4",
    },
    {
      type: "banner",
      linkKey: "vqle",
      alt: "Verdant Queen",
      imageSrc: VerdantQueenBanner,
      objectFit: "cover",
      url: "https://panth.art/collections/0x8cFBB04c54d35e2e8471Ad9040D40D73C08136f0",
    },
    {
      type: "banner",
      linkKey: "scions",
      alt: "Aether Scions",
      imageSrc: AetherScionsBanner,
      objectFit: "contain",
      url: "https://app.electroswap.io/nfts/collection/0xAc620b1A3dE23F4EB0A69663613baBf73F6C535D",
    },
  ];

  return (
    <div
      style={{
        marginTop: 16,
        width: "100%",
        display: "grid",
        gridTemplateColumns: isMobile
          ? "1fr 1fr"
          : "1fr 1.4fr 1.4fr 1.4fr 1fr",
        gap: 14,
        alignItems: "center",
        justifyItems: "center",
      }}
    >
{ecosystemItems.map((item) => {
  const onClick = () =>
    handleEcosystemClick(item.linkKey, item.url);

  switch (item.type) {
    case "card":
      return (
        <EcosystemCard
          key={item.linkKey}
          isMobile={isMobile}
          label={item.label}
          alt={item.alt}
          imageSrc={item.imageSrc}
          videoSrc={item.videoSrc}
          onClick={onClick}
        />
      );

    case "banner":
      return (
        <EcosystemBanner
          key={item.linkKey}
          isMobile={isMobile}
          imageSrc={item.imageSrc}
          alt={item.alt}
          objectFit={item.objectFit}
          onClick={onClick}
        />
      );

    default:
      return null;
  }
})}
   </div>
  );
}