import React from "react";

export default function EcosystemBanner({
  onClick,
  imageSrc,
  alt,
  isMobile,
  objectFit = "contain",
}) {
  return (
    <div
      onClick={onClick}
      style={{
        textDecoration: "none",
        width: "100%",
        maxWidth: isMobile ? "100%" : 280,
        gridColumn: isMobile ? "1 / span 2" : undefined,
        cursor: "pointer",
      }}
    >
      <div
        style={{
          background: "#0f0f0f",
          border: "1px solid #333",
          borderRadius: 12,
          width: "100%",
          height: isMobile ? 60 : 74,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 0 8px rgba(0,0,0,0.5)",
          transition: "all 0.2s ease",
          overflow: "hidden",
          padding: isMobile ? 0 : 6,
          boxSizing: "border-box",
        }}
      >
        <img
          src={imageSrc}
          alt={alt}
          style={{
            width: "100%",
            height: "100%",
            objectFit,
            borderRadius: 8,
            display: "block",
          }}
        />
      </div>
    </div>
  );
}