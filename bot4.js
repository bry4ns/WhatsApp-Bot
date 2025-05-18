console.log("✅ El bot se está iniciando...");

const fs = require("fs");
const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");

// Base de datos simulada (puedes agregar más datos aquí)
const patentesDB = {
  "ABC123": { owner: "Juan Pérez", status: "Vigente", numero: "56987062439@s.whatsapp.net" },
  "XYZ789": { owner: "María López", status: "Vencido", numero: "56957908645@s.whatsapp.net" },
};

// Estados por usuario
const estadoUsuarios = {}; // { "52123456789@s.whatsapp.net": { paso: "esperando_patente", opcion: "1" } }

// Validar si el texto parece una patente
function esPatenteValida(texto) {
  return /^[A-Za-z0-9]{5,7}$/.test(texto);
}

// Consultar una patente
function consultarPatente(patente) {
  return patentesDB[patente.toUpperCase()] || null;
}

// Mostrar menú principal
function obtenerMenuPrincipal() {
  return "👋 ¡Hola! Soy PerBot. ¿Qué necesitas?\n\n1. Contactar a Vehículo para salida\n2. Informar sobre un problema (luces prendidas, robo, etc.)\n\n0. Salir / Volver al menú principal";
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    shouldIgnoreJid: jid => jid.endsWith('@s.whatsapp.net') && sock.user?.id.split(':')[0] === jid.split('@')[0]
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("📲 Escanea este QR para conectar:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log(`❌ Conexión cerrada. Reintentando: ${shouldReconnect}`);
      if (shouldReconnect) {
        startBot();
      } else {
        console.log("🚪 Sesión cerrada. Escanea QR de nuevo.");
      }
    } else if (connection === "open") {
      console.log("✅ Conectado a WhatsApp!");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const message = messages[0];
    if (!message.message || message.key.fromMe) return;

    const sender = message.key.remoteJid;
    const userMsg = (message.message.conversation || "").trim();

    // Inicializar estado si no existe
    if (!estadoUsuarios[sender]) {
      estadoUsuarios[sender] = { paso: "menu" };
    }

    const estado = estadoUsuarios[sender];

    // Opción para reiniciar
    if (userMsg === "0" || userMsg.toLowerCase().includes("volver")) {
      estadoUsuarios[sender] = { paso: "menu" };
      await sock.sendMessage(sender, { text: obtenerMenuPrincipal() });
      return;
    }

    switch (estado.paso) {
      case "menu":
        if (userMsg === "1" || userMsg === "2") {
          estado.paso = "esperando_patente";
          estado.opcion = userMsg;
          await sock.sendMessage(sender, { text: "🚘 Escribe la *patente* del vehículo que deseas notificar:" });
        } else {
          await sock.sendMessage(sender, { text: obtenerMenuPrincipal() });
        }
        break;

      case "esperando_patente":
        if (esPatenteValida(userMsg)) {
          const patente = userMsg.toUpperCase();
          const datos = consultarPatente(patente);

          if (datos) {
            let textoNotificacion = "";

            if (estado.opcion === "1") {
              textoNotificacion = `🔔 *Notificación de salida requerida*\nHola, soy *PerBot*. Se necesita que muevas tu vehículo *${patente}* para permitir la salida. Gracias.`;
            } else {
              textoNotificacion = `🚨 *Alerta de tu vehículo*\nHola, soy *PerBot*. Se ha reportado un problema con tu vehículo *${patente}* (luces encendidas, robo, etc.). Por favor, revisa tu auto.`;
            }

            // Simulación de mensaje al propietario
            await sock.sendMessage(datos.numero, { text: textoNotificacion });

            // Confirmación al usuario que reportó
            await sock.sendMessage(sender, { text: `✅ El propietario fue notificado correctamente.\n\n📄 *Patente:* ${patente}\n👤 *Dueño:* ${datos.owner}\n\nEscribe *0* para volver al menú.` });

            estadoUsuarios[sender] = { paso: "menu" };
          } else {
            await sock.sendMessage(sender, { text: "❌ Patente no encontrada. Intenta con otra o escribe *0* para volver al menú." });
          }
        } else {
          await sock.sendMessage(sender, { text: "⚠️ Patente inválida. Intenta de nuevo o escribe *0* para volver al menú." });
        }
        break;

      default:
        await sock.sendMessage(sender, { text: obtenerMenuPrincipal() });
        estadoUsuarios[sender] = { paso: "menu" };
    }
  });
}

startBot().catch(console.error);
