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
import { issueUserRouter, issueAdminRouter } from "./routes/issueRoutes.js";

const app = express();

// ===== MIDDLEWARE =====
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173,http://localhost:3000,http://localhost:5500")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

app.use(
    cors({
        origin: (origin, cb) => {
            if (!origin) return cb(null, true);
            if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) return cb(null, true);
            return cb(null, false);
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
// ===== END ROUTES =====

app.use((req, res) => {
    res.status(404).send({ status: "Error", message: "Không tìm thấy endpoint" });
});

export default app;
