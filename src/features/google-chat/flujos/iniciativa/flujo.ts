// SOLO SERVIDOR. Flujo «Nueva iniciativa» (/iniciativa, comando 1): formulario → elemento.crear en el tablero de Iniciativas.

import type { FlujoChat } from "../../nucleo/flujo";
import { erroresDe, leerFormulario, tarjetaFormulario, type Leidos } from "../../nucleo/formulario";
import { actualizarDialogo, mensaje } from "../../nucleo/respuestas";
import { AvisoChat } from "../../nucleo/flujo";
import { contextoIniciativa, crearIniciativa, puedeCrearIniciativas, type ContextoIniciativa } from "./datos";

const CLAVE = "iniciativa";
const ACCION_CREAR = "crear";

function tarjeta(ctx: ContextoIniciativa, url: string, extra: { leidos?: Leidos; errores?: string[] } = {}) {
  return tarjetaFormulario({
    titulo: "Nueva iniciativa", campos: ctx.campos, url, flujo: CLAVE,
    enviar: { texto: "Crear iniciativa", accion: ACCION_CREAR },
    tituloOpcional: "Opcional (se puede llenar después)",
    aviso: ctx.pmFijo ? { etiqueta: "Se crea a tu nombre", texto: `PM: ${ctx.pmFijo}` } : undefined,
    ...extra,
  });
}

export const flujoIniciativa: FlujoChat = {
  clave: CLAVE,
  comandoId: 1,
  comando: "/iniciativa",
  titulo: "Nueva iniciativa",
  descripcion: "dar de alta una iniciativa con un formulario",
  puedeUsar: (u) => puedeCrearIniciativas(u.me),

  async abrir({ usuario, url }) {
    return tarjeta(await contextoIniciativa(usuario.me), url);
  },

  async enviar({ usuario, evento, url, origen }, accion) {
    if (accion !== ACCION_CREAR) throw new AvisoChat("No entendí ese botón. Vuelve a abrir el formulario.");
    const ctx = await contextoIniciativa(usuario.me);
    const leidos = leerFormulario(evento, ctx.campos);
    const errores = erroresDe(ctx.campos, leidos);
    if (errores.length) return actualizarDialogo(tarjeta(ctx, url, { leidos, errores }));
    try {
      const ini = await crearIniciativa(ctx, leidos);
      return mensaje(
        `✅ Se creó la iniciativa *${ini.iniId ? `${ini.iniId} · ` : ""}${ini.nombre}* (status New, en Nuevas Iniciativas). ` +
        `Puedes verla en <${origen}/gestion-iniciativas|Gestión de Iniciativas>.`,
      );
    } catch (err) {
      if (!(err instanceof AvisoChat)) throw err;
      // No se pudo crear (permiso, dato inválido…): el formulario sigue abierto con lo que llenó.
      return actualizarDialogo(tarjeta(ctx, url, { leidos, errores: [err.message] }));
    }
  },
};
