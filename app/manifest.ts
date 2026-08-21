import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cleana",
    short_name: "Cleana",
    description: "ניהול הזמנות חדרים, כרטיסיות וססיות לקליניקה",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f1ea",
    theme_color: "#b5622f",
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
