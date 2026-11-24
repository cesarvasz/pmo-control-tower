// SOLO SERVIDOR. Bot de Google Chat · los flujos que existen, en el orden en que salen en el menú.
// Flujo nuevo → su carpeta en flujos/ y una línea aquí (ver nucleo/flujo.ts).

import type { FlujoChat } from "./flujo";
import { flujoIniciativa } from "../flujos/iniciativa/flujo";
import { flujoStatusCard } from "../flujos/status-card/flujo";

export const FLUJOS: FlujoChat[] = [flujoIniciativa, flujoStatusCard];
