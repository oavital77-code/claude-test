import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "בקליניקה",
    short_name: "בקליניקה",
    description: "ניהול הזמנות חדרים, כרטיסיות וססיות לקליניקה",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f4ee",
    theme_color: "#1f5f52",
    orientation: "portrait-primary",
    lang: "he",
    dir: "rtl",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
