import { onRequest } from "firebase-functions/v2/https";
import { createApp } from "./src/app.js";

export const api = onRequest({ region: "asia-south1", timeoutSeconds: 300, memory: "512MiB" }, createApp());
