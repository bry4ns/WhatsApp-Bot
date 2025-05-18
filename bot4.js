console.log("✅ El bot se está iniciando...");

const fs = require("fs");
const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");

// Base de datos simulada
const patentesDB = {
  "ABC123": { owner: "Juan Pérez", numero: "1234@s.whatsapp.net" },
  "XYZ789": { owner: "María López",  numero: "5678@s.whatsapp.net" },
};

// Estado de usuarios por sesión
const estados = {};

function obtenerMenu() {
  return `👋 ¡Hola! Soy PerBot. ¿Qué necesitas?\n\n1. Contactar a vehículo para salida\n2. Informar un problema (luces prendidas, robo, etc.)\n3. Registrar mi patente\n\nEscribe el número de la opción.`;
}

function esPatenteValida(patente) {
  return /^[A-Za-z0-9]{5,7}$/.test(patente);
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info");
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`Usando Baileys versión ${version} (última: ${isLatest})`);

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
      if (shouldReconnect) startBot();
      else console.log("🚪 Sesión cerrada. Escanea QR de nuevo.");
    } else if (connection === "open") {
      console.log("✅ Conectado a WhatsApp!");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const message = messages[0];
    if (!message.message || message.key.fromMe) return;

    const texto = message.message.conversation?.trim();
    const sender = message.key.remoteJid;

    if (!estados[sender]) {
      estados[sender] = { paso: "menu", opcion: null };
      await sock.sendMessage(sender, { text: obtenerMenu() });
      return;
    }

    const estado = estados[sender];

    if (texto === "0") {
      estado.paso = "menu";
      estado.opcion = null;
      await sock.sendMessage(sender, { text: obtenerMenu() });
      return;
    }

    // MENÚ PRINCIPAL
    if (estado.paso === "menu") {
      if (texto === "1") {
        estado.paso = "esperando_patente";
        estado.opcion = "1";
        await sock.sendMessage(sender, { text: "🚗 Opción 1 seleccionada: Contactar vehículo para salida.\n✍️ Escribe la *patente* del vehículo:" });
        return;
      }

      if (texto === "2") {
        estado.paso = "esperando_patente";
        estado.opcion = "2";
        await sock.sendMessage(sender, { text: "🚨 Opción 2 seleccionada: Informar un problema.\n✍️ Escribe la *patente* del vehículo:" });
        return;
      }

      if (texto === "3") {
        estado.paso = "registrar_patente";
        await sock.sendMessage(sender, { text: "📝 Opción 3 seleccionada: Registrar tu vehículo.\n✍️ Escribe la *patente* que deseas registrar:" });
        return;
      }

      await sock.sendMessage(sender, { text: obtenerMenu() });
      return;
    }

    // REGISTRO DE PATENTE
    if (estado.paso === "registrar_patente") {
      if (!esPatenteValida(texto)) {
        await sock.sendMessage(sender, { text: "⚠️ Patente inválida. Debe tener entre 5 y 7 caracteres alfanuméricos. Intenta de nuevo o escribe *0* para volver." });
        return;
      }

      const patente = texto.toUpperCase();

      if (patentesDB[patente]) {
        await sock.sendMessage(sender, { text: `❌ La patente *${patente}* ya está registrada.\nEscribe *0* para volver al menú.` });
        estado.paso = "menu";
        return;
      }

      patentesDB[patente] = {
        owner: "Usuario registrado",
        numero: sender
      };

      await sock.sendMessage(sender, { text: `✅ Patente *${patente}* registrada correctamente.\nEscribe *0* para volver al menú.` });
      estado.paso = "menu";
      return;
    }

    // CONSULTA DE PATENTE PARA OPCIONES 1 Y 2
    if (estado.paso === "esperando_patente") {
      if (!esPatenteValida(texto)) {
        await sock.sendMessage(sender, { text: "⚠️ Patente inválida. Intenta de nuevo o escribe *0* para volver al menú." });
        return;
      }

      const patente = texto.toUpperCase();
      const data = patentesDB[patente];

      if (!data) {
        await sock.sendMessage(sender, { text: "❌ Patente no encontrada. Intenta de nuevo o escribe *0* para volver." });
        return;
      }

      if (estado.opcion === "1") {
        await sock.sendMessage(data.numero, {
          text: "🚨 *Hola!* Soy PerBot.\nSe necesita que muevas tu vehículo para permitir la salida de otro automóvil."
        });

        await sock.sendMessage(sender, {
          text: `✅ Mensaje enviado al dueño de la patente *${patente}*.\nEscribe *0* para volver al menú.`
        });
      }

      if (estado.opcion === "2") {
        await sock.sendMessage(data.numero, {
          text: "🔔 *Hola!* Soy PerBot.\nTu vehículo presenta un problema reportado (luces encendidas, vidrios abajo, etc.)."
        });

        await sock.sendMessage(sender, {
          text: `✅ El dueño de la patente *${patente}* fue notificado.\nEscribe *0* para volver al menú.`
        });
      }

      estado.paso = "menu";
      return;
    }

    // Si no coincide con nada
    await sock.sendMessage(sender, { text: "⚠️ Opción no reconocida. Escribe *0* para volver al menú." });
  });
}

startBot().catch(console.error);
