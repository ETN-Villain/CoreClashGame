import React from "react";

export default function EcosystemCard({
  onClick,
  imageSrc,
  videoSrc,
  alt,
  label,
  isMobile,
  maxWidth = 140,
}) {
  return (
    <div
      onClick={onClick}
      style={{
        textDecoration: "none",
        width: "100%",
        maxWidth,
        cursor: "pointer",
      }}
    >
      <div
        style={{
          background: "#0f0f0f",
          border: "1px solid #333",
          borderRadius: 12,
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          boxShadow: "0 0 8px rgba(0,0,0,0.5)",
          transition: "all 0.2s ease",
        }}
      >
        {videoSrc ? (
          <video
            src={videoSrc}
            autoPlay
            loop
            muted
            playsInline
            style={{
              width: 38,
              height: 38,
              borderRadius: 6,
              objectFit: "cover",
            }}
          />
        ) : (
          <img
            src={imageSrc}
            alt={alt}
            style={{
              width: 34,
              height: 34,
              borderRadius: 6,
            }}
          />
        )}

        <span
          style={{
            fontSize: isMobile ? 12 : 14,
            fontWeight: 600,
            color: "#fff",
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}