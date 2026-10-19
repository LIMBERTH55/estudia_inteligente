import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "ExamPredict AI — Prepara tus exámenes con IA",
  description:
    "Sube tus apuntes y diapositivas, genera preguntas de examen, estima la relevancia de cada tema y practica con simulaciones calificadas por IA.",
};

const themeScript = `(function(){try{var t=localStorage.getItem('ep-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
