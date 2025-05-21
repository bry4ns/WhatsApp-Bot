# 🤖 PerBot - Bot de WhatsApp para gestión de vehículos

**PerBot** es un bot de WhatsApp desarrollado con [Baileys](https://github.com/WhiskeySockets/Baileys), diseñado para enviar mensajes automáticos a dueños de vehículos según diferentes situaciones como salida de otro auto, alertas de luces encendidas, robo, etc.

---

## 🚀 Funcionalidades

- ✅ Conexión automática a WhatsApp vía QR.
- 🧾 Menú interactivo con opciones claras.
- 🔍 Consulta de patentes registradas.
- 📤 Envío automático de mensajes al dueño del vehículo.
- 📝 Registro de nuevas patentes por los mismos usuarios.
- 📱 Asociación de patente con número de WhatsApp.

---

## 📦 Requisitos

- Node.js v16 o superior
- WhatsApp activo con un número válido
- Terminal (para escanear QR)

---

## 🛠 Instalación

1. **Clona este repositorio:**

```bash
git clone https://github.com/bry4ns/WhatsApp-Bot.git
npm install express @whiskeysockets/baileys qrcode-terminal better-sqlite3
