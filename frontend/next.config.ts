import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy same-origin: /api/* -> FastAPI (evita CORS y usa cookies httpOnly del backend)
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
