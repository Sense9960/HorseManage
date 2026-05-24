import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";

import swaggerSpec from "./config/swagger.js";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import ownerRoutes from "./routes/ownerRoutes.js";
import jockeyRoutes from "./routes/jockeyRoutes.js";
import refereeRoutes from "./routes/refereeRoutes.js";
import endUserRoutes from "./routes/endUserRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import { walletRouter, sepayRouter } from "./routes/walletRoutes.js";

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
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
// ===== END API DOCS =====

// ===== ROUTES =====
app.get("/health", (req, res) =>
    res.send({ status: "Success", message: "HorseManage API is running" })
);

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/owner", ownerRoutes);
app.use("/api/jockey", jockeyRoutes);
app.use("/api/referee", refereeRoutes);
app.use("/api/enduser", endUserRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/wallet", walletRouter);
app.use("/api/sepay", sepayRouter);
// ===== END ROUTES =====

app.use((req, res) => {
    res.status(404).send({ status: "Error", message: "Không tìm thấy endpoint" });
});

export default app;
