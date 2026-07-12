import express from "express";
import cors from "cors";

import swaggerSpec from "./config/swagger.js";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import ownerRoutes from "./routes/ownerRoutes.js";
import jockeyRoutes from "./routes/jockeyRoutes.js";
import refereeRoutes from "./routes/refereeRoutes.js";
import endUserRoutes from "./routes/endUserRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import { walletRouter, vnpayRouter } from "./routes/walletRoutes.js";
import weatherRoutes from "./routes/weatherRoutes.js";
import raceRoutes from "./routes/raceRoutes.js";
import { issueUserRouter, issueAdminRouter } from "./routes/issueRoutes.js";

const app = express();

// ===== MIDDLEWARE =====
// CORS: mặc định (không set CORS_ORIGINS) hoặc CORS_ORIGINS="*" → reflect MỌI
// origin. FE deploy ở domain nào cũng login được mà không dính lỗi CORS —
// trước đây default chỉ whitelist localhost nên FE trên Vercel bị chặn.
// Muốn khoá lại: set CORS_ORIGINS="https://fe-domain.com,https://khac.com".
// (origin: true thay vì "*" để tương thích credentials: true.)
const corsOriginsEnv = (process.env.CORS_ORIGINS || "").trim();
const allowedOrigins = corsOriginsEnv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const allowAllOrigins = allowedOrigins.length === 0 || allowedOrigins.includes("*");

app.use(
    cors({
        origin: allowAllOrigins
            ? true
            : (origin, cb) => {
                if (!origin) return cb(null, true);
                return cb(null, allowedOrigins.includes(origin));
            },
        credentials: true,
    })
);
app.use(express.json());
// ===== END MIDDLEWARE =====

// ===== API DOCS =====
// swagger-ui-express bundles static assets from node_modules; on Vercel
// serverless those don't get served correctly. Instead we expose the raw
// OpenAPI JSON and render a self-contained HTML page that pulls swagger-ui
// from a CDN.
app.get("/api-docs.json", (req, res) => res.json(swaggerSpec));

app.get("/api-docs", (req, res) => {
    res.type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>HorseManage API Docs</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
<style>body{margin:0}</style>
</head>
<body>
<div id="swagger-ui"></div>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
<script>
window.ui = SwaggerUIBundle({
    url: '/api-docs.json',
    dom_id: '#swagger-ui',
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset.slice(1)],
    layout: 'StandaloneLayout',
});
</script>
</body>
</html>`);
});
// ===== END API DOCS =====

// ===== ROUTES =====
// Root → Swagger UI so anyone hitting the bare URL lands on the docs.
app.get("/", (req, res) => res.redirect("/api-docs"));

app.get("/health", (req, res) =>
    res.send({ status: "Success", message: "HorseManage API is running" })
);

app.use("/api/auth", authRoutes);
app.use("/api/admin/issues", issueAdminRouter);
app.use("/api/admin", adminRoutes);
app.use("/api/issues", issueUserRouter);
app.use("/api/owner", ownerRoutes);
app.use("/api/jockey", jockeyRoutes);
app.use("/api/referee", refereeRoutes);
app.use("/api/enduser", endUserRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/wallet", walletRouter);
app.use("/api/vnpay", vnpayRouter);
app.use("/api/weather", weatherRoutes);
app.use("/api/races", raceRoutes);
// ===== END ROUTES =====

app.use((req, res) => {
    res.status(404).send({ status: "Error", message: "Không tìm thấy endpoint" });
});

export default app;
