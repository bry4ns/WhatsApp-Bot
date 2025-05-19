async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    shouldIgnoreJid: jid => {
      if (!jid || typeof jid !== 'string') return false;
      return jid === (sock.user?.id || '');
    }
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

    if (!estadoUsuarios[sender]) {
      estadoUsuarios[sender] = { paso: "menu" };
    }

    const estado = estadoUsuarios[sender];

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
        } else if (userMsg === "3") {
          estado.paso = "registrando_patente";
          await sock.sendMessage(sender, { text: "📝 Por favor, escribe la *patente* que deseas registrar (5-7 caracteres alfanuméricos):" });
        } else {
          await sock.sendMessage(sender, { text: obtenerMenuPrincipal() });
        }
        break;

      case "registrando_patente":
        if (!esPatenteValida(userMsg)) {
          await sock.sendMessage(sender, { text: "⚠️ Patente inválida. Intenta de nuevo o escribe *0* para volver." });
          return;
        }

        const patenteNueva = userMsg.toUpperCase();

        if (patentesDB[patenteNueva]) {
          await sock.sendMessage(sender, { text: `❌ La patente *${patenteNueva}* ya está registrada.\nEscribe *0* para volver al menú.` });
          estadoUsuarios[sender] = { paso: "menu" };
          return;
        }

        patentesDB[patenteNueva] = {
          owner: "Registrado vía bot",
          numero: sender,
          status: "Vigente"
        };

        await sock.sendMessage(sender, { text: `✅ Patente *${patenteNueva}* registrada exitosamente.\nEscribe *0* para volver al menú.` });
        estadoUsuarios[sender] = { paso: "menu" };
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

            await sock.sendMessage(datos.numero, { text: textoNotificacion });

            await sock.sendMessage(sender, {
              text: `✅ El propietario fue notificado correctamente.\n\n📄 *Patente:* ${patente}\n👤 *Dueño:* ${datos.owner}\n\nEscribe *0* para volver al menú.`
            });

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